import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { Serialized } from "@langchain/core/load/serializable";

import {
  buildClearBoardAssistantMessage,
  buildDeterministicBoardCommandResponse,
  buildOpenAiBoardCommandResponse,
  buildStubBoardCommandResponse,
  detectBoardCommandIntent,
  MCP_TEMPLATE_TIMEOUT_MS,
  parseBoardCommandRequest,
} from "@/features/ai/board-command";
import {
  AI_ROUTE_TIMEOUT_MS,
  acquireBoardCommandLock,
  checkUserRateLimit,
  releaseBoardCommandLock,
  validateTemplatePlan,
  withTimeout,
} from "@/features/ai/guardrails";
import {
  callCommandPlanTool,
} from "@/features/ai/mcp/template-mcp-client";
import { LangChainLangfuseCallbackHandler } from "@/features/ai/observability/langchain-langfuse-handler";
import {
  flushLangfuseClient,
  isLangfuseConfigured,
} from "@/features/ai/observability/langfuse-client";
import { createAiTraceRun } from "@/features/ai/observability/trace-run";
import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import { parseCoordinateHintsFromMessage } from "@/features/ai/commands/coordinate-hints";
import {
  finalizeOpenAiBudgetReservation,
  releaseOpenAiBudgetReservation,
  reserveOpenAiBudget,
} from "@/features/ai/openai/openai-cost-controls";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";
import {
  planBoardCommandWithOpenAi,
} from "@/features/ai/openai/openai-command-planner";
import {
  flushOpenAiTraces,
  runBoardCommandWithOpenAiAgents,
} from "@/features/ai/openai/agents/openai-agents-runner";
import { parseMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";
import { getOpenAiRequiredErrorResponse } from "@/features/ai/openai/openai-required-response";
import {
  buildOpenAiExecutionSummary,
  getOpenAiUsageFromError,
  isOpenAiRequiredForStubCommands,
  type OpenAiPlanAttempt,
} from "@/features/ai/server/board-command-openai-types";
import {
  buildOpenAiPlanTraceFields,
  buildOperationCountsByTool,
  buildOutcomeAssistantMessageFromExecution,
  buildToolCallArgTraceFields,
} from "@/features/ai/server/board-command-plan-trace";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type {
  BoardObjectSnapshot,
  BoardToolCall,
  TemplatePlan,
  ViewportBounds,
} from "@/features/ai/types";
import {
  assertFirestoreWritesAllowedInDev,
  getFirebaseAdminDb,
} from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc,
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS = 250;
const MAX_AI_TRACE_FLUSH_TIMEOUT_MS = 3_000;

function isAiAuditEnabled(): boolean {
  return process.env.AI_AUDIT_LOG_ENABLED === "true";
}

function getInternalMcpToken(): string | null {
  const value = process.env.MCP_INTERNAL_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

function getErrorReason(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    return message && message.length > 0
      ? message
      : error.name || "Error without message";
  }

  if (typeof error === "string") {
    const message = error.trim();
    return message.length > 0 ? message : "Empty string error";
  }

  if (!error || typeof error !== "object") {
    return `Non-error throwable (${typeof error})`;
  }

  const candidate = error as {
    name?: unknown;
    message?: unknown;
    code?: unknown;
    status?: unknown;
  };

  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message.trim();
  }

  const parts: string[] = [];
  if (
    typeof candidate.name === "string" &&
    candidate.name.trim().length > 0
  ) {
    parts.push(`name=${candidate.name.trim()}`);
  }
  if (
    typeof candidate.code === "string" ||
    typeof candidate.code === "number"
  ) {
    parts.push(`code=${String(candidate.code)}`);
  }
  if (typeof candidate.status === "number" && Number.isFinite(candidate.status)) {
    parts.push(`status=${String(candidate.status)}`);
  }

  return parts.length > 0
    ? `Non-error throwable (${parts.join(", ")})`
    : "Non-error throwable (object)";
}

function getDebugMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return getErrorReason(error);
}

function createHttpError(
  status: number,
  message: string,
): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

function parseRequiredFlag(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  return fallback;
}

function getAiTraceFlushTimeoutMs(): number {
  const rawValue = process.env.AI_TRACE_FLUSH_TIMEOUT_MS?.trim();
  if (!rawValue) {
    return DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS;
  }

  return Math.max(
    0,
    Math.min(MAX_AI_TRACE_FLUSH_TIMEOUT_MS, Math.floor(parsed)),
  );
}

function isAiTracingRequired(): boolean {
  return parseRequiredFlag(
    process.env.AI_REQUIRE_TRACING,
    process.env.NODE_ENV === "production",
  );
}

function isOpenAiTracingRequired(): boolean {
  return parseRequiredFlag(
    process.env.AI_REQUIRE_OPENAI_TRACING,
    isAiTracingRequired(),
  );
}

function getAiTracingConfigurationError(): string | null {
  if (isAiTracingRequired() && !isLangfuseConfigured()) {
    return "AI tracing misconfigured: missing LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY.";
  }
  if (isAiTracingRequired() && !process.env.LANGFUSE_BASE_URL?.trim()) {
    return "AI tracing misconfigured: missing LANGFUSE_BASE_URL (set https://us.cloud.langfuse.com).";
  }

  const openAiConfig = getOpenAiPlannerConfig();
  if (
    isOpenAiTracingRequired() &&
    openAiConfig.enabled &&
    openAiConfig.runtime === "agents-sdk" &&
    !openAiConfig.agentsTracing
  ) {
    return "OpenAI tracing misconfigured: set OPENAI_AGENTS_TRACING=true.";
  }

  return null;
}

const DIRECT_DELETE_BATCH_CHUNK_SIZE = 400;
const SAFE_DETERMINISTIC_INTENT_PREFIXES = [
  "create-",
  "move-",
  "clear-board",
  "delete",
  "arrange-",
  "align-",
  "distribute-",
  "fit-frame",
  "resize-",
  "change-color",
  "update-text",
  "select-",
  "unselect",
] as const;
const SAFE_DETERMINISTIC_EXACT_INTENTS = new Set([
  "create-frame",
  "create-sticky",
  "create-sticky-batch",
  "create-sticky-grid",
  "swot-template",
  "add-swot-item",
  "create-journey-map",
  "create-retrospective-board",
  "arrange-grid",
  "clear-board",
  "clear-board-empty",
  "move-selected",
  "move-all",
  "distribute-objects",
  "align-objects",
  "fit-frame-to-contents",
  "resize-selected",
  "change-color",
  "update-text",
  "delete-selected",
  "unselect",
  "select-all",
  "select-visible",
]);
const LANGCHAIN_TOOL_PLAN_SERIALIZED: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["collabboard", "ai", "tool-plan"],
};

function isSafeDeterministicIntent(intent: string): boolean {
  if (SAFE_DETERMINISTIC_EXACT_INTENTS.has(intent)) {
    return true;
  }
  return SAFE_DETERMINISTIC_INTENT_PREFIXES.some((prefix) =>
    intent.startsWith(prefix),
  );
}

function shouldExecuteDeterministicPlan(
  plannerMode: string,
  intent: string,
): boolean {
  if (plannerMode === "deterministic-only") {
    return true;
  }

  return isSafeDeterministicIntent(intent);
}

function toSerializedTool(toolName: BoardToolCall["tool"]): Serialized {
  return {
    lc: 1,
    type: "not_implemented",
    id: ["collabboard", "ai", "tool", toolName],
  };
}

function createsObject(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createStickyBatch" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createShapeBatch" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

async function attemptOpenAiPlanner(options: {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  viewportBounds: ViewportBounds | null;
  boardId: string;
  userId: string;
  executor: BoardToolExecutor;
  trace: ReturnType<typeof createAiTraceRun>;
}): Promise<OpenAiPlanAttempt> {
  const config = getOpenAiPlannerConfig();
  if (!config.enabled) {
    return {
      status: "disabled",
      model: config.model,
      runtime: config.runtime,
      reason: "OpenAI planner disabled.",
    };
  }

  const budgetSpan = options.trace.startSpan("openai.budget.reserve", {
    reserveUsd: config.reserveUsdPerCall,
  });
  const budgetReservation = await reserveOpenAiBudget(config.reserveUsdPerCall);
  if (!budgetReservation.ok) {
    budgetSpan.fail(budgetReservation.error, {
      totalSpentUsd: budgetReservation.totalSpentUsd,
    });
    return {
      status: "budget-blocked",
      model: config.model,
      runtime: config.runtime,
      assistantMessage: budgetReservation.error,
      totalSpentUsd: budgetReservation.totalSpentUsd,
    };
  }
  budgetSpan.end({
    totalSpentUsd: budgetReservation.totalSpentUsd,
  });

  let reservationOpen = true;
  const coordinateHints = parseCoordinateHintsFromMessage(options.message);
  const messageIntentHints = parseMessageIntentHints(options.message);
  const openAiSpan = options.trace.startSpan("openai.call", {
    model: config.model,
    runtime: config.runtime,
    openAiTraceEnabled: config.agentsTracing,
    openAiWorkflowName: config.agentsWorkflowName,
    messagePreview: options.message.slice(0, 240),
    hintedX: coordinateHints.hintedX,
    hintedY: coordinateHints.hintedY,
    requestedCreateCount: messageIntentHints.requestedCreateCount,
    stickyRequestedCount: messageIntentHints.stickyRequestedCount,
    shapeRequestedCount: messageIntentHints.shapeRequestedCount,
    requestedColumns: messageIntentHints.stickyLayoutHints.columns ?? null,
    requestedGapX: messageIntentHints.stickyLayoutHints.gapX ?? null,
    requestedGapY: messageIntentHints.stickyLayoutHints.gapY ?? null,
  });

  try {
    if (config.runtime === "agents-sdk") {
      const toolExecutionSpan = options.trace.startSpan("tool.execute", {
        runtime: "agents-sdk",
      });

      const agentsRunResult = await runBoardCommandWithOpenAiAgents({
        message: options.message,
        boardId: options.boardId,
        userId: options.userId,
        boardState: options.boardState,
        selectedObjectIds: options.selectedObjectIds,
        viewportBounds: options.viewportBounds,
        executor: options.executor,
        trace: options.trace,
      });
      toolExecutionSpan.end({
        runtime: "agents-sdk",
        toolCalls: agentsRunResult.toolCalls,
        operationsExecuted: agentsRunResult.operationsExecuted.length,
      });

      const syntheticPlan: TemplatePlan = {
        templateId: "openai.agents.direct",
        templateName: "OpenAI Agents Direct",
        operations: agentsRunResult.operationsExecuted,
      };
      const planTraceFields = buildOpenAiPlanTraceFields(syntheticPlan);
      const operationCountsByToolJson = buildOperationCountsByTool(syntheticPlan);

      const actualUsd =
        agentsRunResult.usage.estimatedCostUsd > 0
          ? agentsRunResult.usage.estimatedCostUsd
          : config.reserveUsdPerCall;
      const finalized = await finalizeOpenAiBudgetReservation({
        reservedUsd: budgetReservation.reservedUsd,
        actualUsd:
          agentsRunResult.policyBlocked && actualUsd > 0 ? 0 : actualUsd,
      });
      reservationOpen = false;

      openAiSpan.end({
        planned: agentsRunResult.planned,
        intent: agentsRunResult.intent,
        inputTokens: agentsRunResult.usage.inputTokens,
        outputTokens: agentsRunResult.usage.outputTokens,
        totalTokens: agentsRunResult.usage.totalTokens,
        estimatedCostUsd: agentsRunResult.usage.estimatedCostUsd,
        totalSpentUsd: finalized.totalSpentUsd,
        openAiRuntime: "agents-sdk",
        openAiRunId: agentsRunResult.responseId ?? null,
        openAiTraceId: agentsRunResult.traceId ?? null,
        operationCount: planTraceFields.operationCount,
        operationCountsByToolJson,
        operationsPreviewJson: planTraceFields.operationsPreviewJson,
        firstOperationTool: planTraceFields.firstOperationTool,
        firstOperationX: planTraceFields.firstOperationX,
        firstOperationY: planTraceFields.firstOperationY,
        policyBlocked: Boolean(agentsRunResult.policyBlocked),
        requestedCount: agentsRunResult.policyBlocked?.requestedCreateCount ?? null,
        maxAllowedCount: agentsRunResult.policyBlocked?.maxAllowedCount ?? null,
      });

      if (agentsRunResult.policyBlocked) {
        return {
          status: "policy-blocked",
          model: config.model,
          runtime: config.runtime,
          intent: "create-object-limit-exceeded",
          assistantMessage: agentsRunResult.assistantMessage,
          requestedCount: agentsRunResult.policyBlocked.requestedCreateCount,
          maxAllowedCount: agentsRunResult.policyBlocked.maxAllowedCount,
          totalSpentUsd: finalized.totalSpentUsd,
        };
      }

      if (!agentsRunResult.planned) {
        return {
          status: "not-planned",
          model: config.model,
          runtime: config.runtime,
          intent: agentsRunResult.intent,
          assistantMessage: agentsRunResult.assistantMessage,
          ...(agentsRunResult.traceId
            ? { openAiTraceId: agentsRunResult.traceId }
            : {}),
          totalSpentUsd: finalized.totalSpentUsd,
          usage: agentsRunResult.usage,
        };
      }

      return {
        status: "planned",
        model: config.model,
        runtime: config.runtime,
        intent: agentsRunResult.intent,
        assistantMessage: agentsRunResult.assistantMessage,
        ...(agentsRunResult.traceId
          ? { openAiTraceId: agentsRunResult.traceId }
          : {}),
        plan: null,
        executedDirectly: true,
        directExecution: {
          operationsExecuted: agentsRunResult.operationsExecuted,
          results: agentsRunResult.results,
          createdObjectIds: agentsRunResult.createdObjectIds,
          deletedCount: agentsRunResult.deletedCount,
          toolCalls: agentsRunResult.toolCalls,
          responseId: agentsRunResult.responseId,
        },
        totalSpentUsd: finalized.totalSpentUsd,
        usage: agentsRunResult.usage,
      };
    }

    const plannerResult = await planBoardCommandWithOpenAi({
      message: options.message,
      boardState: options.boardState,
      selectedObjectIds: options.selectedObjectIds,
    });
    const planTraceFields = buildOpenAiPlanTraceFields(plannerResult.plan);
    const operationCountsByToolJson = buildOperationCountsByTool(
      plannerResult.plan,
    );

    const actualUsd =
      plannerResult.usage.estimatedCostUsd > 0
        ? plannerResult.usage.estimatedCostUsd
        : config.reserveUsdPerCall;
    const finalized = await finalizeOpenAiBudgetReservation({
      reservedUsd: budgetReservation.reservedUsd,
      actualUsd,
    });
    reservationOpen = false;

    openAiSpan.end({
      planned: plannerResult.planned,
      intent: plannerResult.intent,
      inputTokens: plannerResult.usage.inputTokens,
      outputTokens: plannerResult.usage.outputTokens,
      totalTokens: plannerResult.usage.totalTokens,
      estimatedCostUsd: plannerResult.usage.estimatedCostUsd,
      totalSpentUsd: finalized.totalSpentUsd,
      openAiRuntime: "chat-completions",
      operationCount: planTraceFields.operationCount,
      operationCountsByToolJson,
      operationsPreviewJson: planTraceFields.operationsPreviewJson,
      firstOperationTool: planTraceFields.firstOperationTool,
      firstOperationX: planTraceFields.firstOperationX,
      firstOperationY: planTraceFields.firstOperationY,
    });

    if (!plannerResult.planned || !plannerResult.plan) {
      return {
        status: "not-planned",
        model: config.model,
        runtime: config.runtime,
        intent: plannerResult.intent,
        assistantMessage: plannerResult.assistantMessage,
        totalSpentUsd: finalized.totalSpentUsd,
        usage: plannerResult.usage,
      };
    }

    return {
      status: "planned",
      model: config.model,
      runtime: config.runtime,
      intent: plannerResult.intent,
      assistantMessage: plannerResult.assistantMessage,
      plan: plannerResult.plan,
      executedDirectly: false,
      totalSpentUsd: finalized.totalSpentUsd,
      usage: plannerResult.usage,
    };
  } catch (error) {
    const usage = getOpenAiUsageFromError(error);
    let totalSpentUsd: number | undefined;

    if (reservationOpen) {
      if (usage) {
        const finalized = await finalizeOpenAiBudgetReservation({
          reservedUsd: budgetReservation.reservedUsd,
          actualUsd:
            usage.estimatedCostUsd > 0
              ? usage.estimatedCostUsd
              : config.reserveUsdPerCall,
        });
        totalSpentUsd = finalized.totalSpentUsd;
      } else {
        await releaseOpenAiBudgetReservation(budgetReservation.reservedUsd);
      }
    }

    const reason = getErrorReason(error);
    openAiSpan.fail("OpenAI planner failed.", {
      reason,
      ...(usage
        ? {
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            totalTokens: usage.totalTokens,
            estimatedCostUsd: usage.estimatedCostUsd,
          }
        : {}),
      ...(typeof totalSpentUsd === "number" ? { totalSpentUsd } : {}),
    });
    return {
      status: "error",
      model: config.model,
      runtime: config.runtime,
      reason,
      ...(usage ? { usage } : {}),
      ...(typeof totalSpentUsd === "number" ? { totalSpentUsd } : {}),
    };
  }
}

async function executePlanWithTracing(options: {
  executor: BoardToolExecutor;
  trace: ReturnType<typeof createAiTraceRun>;
  operations: BoardToolCall[];
}): Promise<{
  results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
  createdObjectIds: string[];
}> {
  const results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[] =
    [];
  const createdObjectIdSet = new Set<string>();
  const callbackManager = new CallbackManager();
  callbackManager.addHandler(
    new LangChainLangfuseCallbackHandler(options.trace),
    true,
  );
  const chainRun = await callbackManager.handleChainStart(
    LANGCHAIN_TOOL_PLAN_SERIALIZED,
    {
      operationCount: options.operations.length,
    },
    undefined,
    "chain",
    ["langchain", "tool-execution"],
    {
      traceId: options.trace.traceId,
    },
    "tool.execute",
  );

  try {
    const toolManager = chainRun.getChild("tool.execute.call");

    for (let index = 0; index < options.operations.length; index += 1) {
      const operation = options.operations[index];
      const argTraceFields = buildToolCallArgTraceFields(operation);
      const toolRun = await toolManager.handleToolStart(
        toSerializedTool(operation.tool),
        JSON.stringify(operation.args ?? {}),
        undefined,
        undefined,
        ["board-tool-call"],
        {
          operationIndex: index,
          tool: operation.tool,
          argKeysJson: argTraceFields.argKeysJson,
          argsPreviewJson: argTraceFields.argsPreviewJson,
          x: argTraceFields.x,
          y: argTraceFields.y,
          objectIdsCount: argTraceFields.objectIdsCount,
        },
        operation.tool,
      );

      try {
        const result = await options.executor.executeToolCall(operation);
        results.push(result);

        if (result.objectId && createsObject(operation)) {
          createdObjectIdSet.add(result.objectId);
        }
        if (Array.isArray(result.createdObjectIds)) {
          result.createdObjectIds.forEach((createdObjectId) => {
            if (typeof createdObjectId === "string" && createdObjectId.length > 0) {
              createdObjectIdSet.add(createdObjectId);
            }
          });
        }

        await toolRun.handleToolEnd({
          objectId: result.objectId ?? null,
          deletedCount: result.deletedCount ?? 0,
          createdCount: result.createdObjectIds?.length ?? 0,
          tool: operation.tool,
        });
      } catch (error) {
        await toolRun.handleToolError(error);
        throw error;
      }
    }

    await chainRun.handleChainEnd({
      toolCalls: results.length,
    });

    return {
      results,
      createdObjectIds: Array.from(createdObjectIdSet),
    };
  } catch (error) {
    await chainRun.handleChainError(error, undefined, undefined, undefined, {
      inputs: {
        completedToolCalls: results.length,
      },
    });
    throw error;
  }
}

async function listAllBoardObjectIds(boardId: string): Promise<string[]> {
  const snapshot = await getFirebaseAdminDb()
    .collection("boards")
    .doc(boardId)
    .collection("objects")
    .get();
  return snapshot.docs.map((documentSnapshot) => documentSnapshot.id);
}

async function deleteBoardObjectsById(
  boardId: string,
  objectIds: string[],
): Promise<void> {
  if (objectIds.length === 0) {
    return;
  }

  const objectsCollection = getFirebaseAdminDb()
    .collection("boards")
    .doc(boardId)
    .collection("objects");

  for (
    let index = 0;
    index < objectIds.length;
    index += DIRECT_DELETE_BATCH_CHUNK_SIZE
  ) {
    const chunk = objectIds.slice(
      index,
      index + DIRECT_DELETE_BATCH_CHUNK_SIZE,
    );
    const batch = getFirebaseAdminDb().batch();
    chunk.forEach((objectId) => {
      batch.delete(objectsCollection.doc(objectId));
    });
    await batch.commit();
  }
}

async function writeAiAuditLogIfEnabled(options: {
  boardId: string;
  userId: string;
  message: string;
  traceId: string;
  fallbackUsed: boolean;
  mcpUsed: boolean;
  toolCalls: number;
  objectsCreated: number;
  intent: string;
}): Promise<void> {
  if (!isAiAuditEnabled()) {
    return;
  }

  await getFirebaseAdminDb()
    .collection("boards")
    .doc(options.boardId)
    .collection("aiRuns")
    .add({
      userId: options.userId,
      message: options.message,
      traceId: options.traceId,
      intent: options.intent,
      fallbackUsed: options.fallbackUsed,
      mcpUsed: options.mcpUsed,
      toolCalls: options.toolCalls,
      objectsCreated: options.objectsCreated,
      createdAt: FieldValue.serverTimestamp(),
    });
}

export async function POST(request: NextRequest) {
  let activeTrace: ReturnType<typeof createAiTraceRun> | null = null;
  let boardLockId: string | null = null;

  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      );
    }

    const parsedPayload = parseBoardCommandRequest(payload);
    if (!parsedPayload) {
      return NextResponse.json(
        { error: "Invalid board command payload." },
        { status: 400 },
      );
    }

    const user = await requireUser(request);
    const boardSnapshot = await getFirebaseAdminDb()
      .collection("boards")
      .doc(parsedPayload.boardId)
      .get();

    if (!boardSnapshot.exists) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const board = parseBoardDoc(boardSnapshot.data());
    if (!board) {
      return NextResponse.json(
        { error: "Invalid board data." },
        { status: 500 },
      );
    }

    if (!canUserReadBoard(board, user.uid)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const intent = detectBoardCommandIntent(parsedPayload.message);
    const canEdit = canUserEditBoard(board, user.uid);
    const tracingConfigurationError = getAiTracingConfigurationError();
    if (tracingConfigurationError) {
      return NextResponse.json(
        { error: tracingConfigurationError },
        { status: 503 },
      );
    }

    if (canEdit) {
      assertFirestoreWritesAllowedInDev();
    }

    if (intent === "stub" && !canEdit) {
      const traceId = randomUUID();
      activeTrace = createAiTraceRun({
        traceName: "board-command",
        traceId,
        userId: user.uid,
        boardId: parsedPayload.boardId,
        message: parsedPayload.message,
        metadata: {
          intent,
        },
      });

      const response = buildStubBoardCommandResponse({
        message: parsedPayload.message,
        canEdit,
      });
      const responseWithTrace = {
        ...response,
        traceId,
      };
      const responseSpan = activeTrace.startSpan("ai.response.sent", {
        status: 200,
        provider: response.provider,
      });
      responseSpan.end({
        traceId,
      });
      activeTrace.finishSuccess({
        fallbackUsed: false,
        mcpUsed: false,
        mode: "stub",
      });
      return NextResponse.json(responseWithTrace);
    }

    if (canEdit) {
      const rateLimitResult = await checkUserRateLimit(user.uid);
      if (!rateLimitResult.ok) {
        return NextResponse.json(
          { error: rateLimitResult.error },
          { status: rateLimitResult.status },
        );
      }

      const lockResult = await acquireBoardCommandLock(parsedPayload.boardId);
      if (!lockResult.ok) {
        return NextResponse.json(
          { error: lockResult.error },
          { status: lockResult.status },
        );
      }
      boardLockId = parsedPayload.boardId;

      const traceId = randomUUID();
      activeTrace = createAiTraceRun({
        traceName: "board-command",
        traceId,
        userId: user.uid,
        boardId: parsedPayload.boardId,
        message: parsedPayload.message,
        metadata: {
          intent,
        },
      });

      const response = await withTimeout(
        (async () => {
          const executor = new BoardToolExecutor({
            boardId: parsedPayload.boardId,
            userId: user.uid,
          });

          const stateSpan = activeTrace.startSpan("ai.request.received", {
            selectedObjectCount: parsedPayload.selectedObjectIds?.length ?? 0,
          });
          const boardObjects = await executor.getBoardState();
          stateSpan.end({
            existingObjectCount: boardObjects.length,
          });

          let plannerResult:
            | {
                planned: boolean;
                intent: string;
                assistantMessage: string;
                plan?: TemplatePlan;
                selectionUpdate?: {
                  mode: "clear" | "replace";
                  objectIds: string[];
                };
              }
            | null = null;
          let fallbackUsed = false;
          let mcpUsed = true;
          let llmUsed = false;
          const selectedObjectIds = parsedPayload.selectedObjectIds ?? [];
          const openAiConfig = getOpenAiPlannerConfig();
          const plannerMode = openAiConfig.plannerMode;
          const requireOpenAi =
            plannerMode === "openai-strict" || isOpenAiRequiredForStubCommands();
          const deterministicPlanResult = planDeterministicCommand({
            message: parsedPayload.message,
            boardState: boardObjects,
            selectedObjectIds,
            viewportBounds: parsedPayload.viewportBounds ?? null,
          });
          const forceDeterministicForClearIntent =
            deterministicPlanResult.intent === "clear-board" ||
            deterministicPlanResult.intent === "clear-board-empty";
          const shouldExecuteDeterministic =
            forceDeterministicForClearIntent ||
            (deterministicPlanResult.planned &&
              shouldExecuteDeterministicPlan(
                plannerMode,
                deterministicPlanResult.intent,
              ));
          const shouldAttemptOpenAi =
            plannerMode !== "deterministic-only" && !shouldExecuteDeterministic;

          const openAiAttempt = shouldAttemptOpenAi
            ? await attemptOpenAiPlanner({
                message: parsedPayload.message,
                boardId: parsedPayload.boardId,
                userId: user.uid,
                boardState: boardObjects,
                selectedObjectIds,
                viewportBounds: parsedPayload.viewportBounds ?? null,
                executor,
                trace: activeTrace,
              })
            : {
                status: "disabled" as const,
                model: openAiConfig.model,
                runtime: openAiConfig.runtime,
              reason:
                shouldExecuteDeterministic
                  ? "Skipped because deterministic planner was used."
                : deterministicPlanResult.planned
                  ? "Skipped deterministic planner to prefer OpenAI."
                    : plannerMode === "deterministic-only"
                      ? "Skipped because AI_PLANNER_MODE=deterministic-only."
                    : "OpenAI planner disabled by runtime configuration.",
            };
          const openAiExecution = buildOpenAiExecutionSummary(openAiAttempt);
          if (shouldExecuteDeterministic) {
            plannerResult = deterministicPlanResult;
            mcpUsed = false;
          } else if (openAiAttempt.status === "planned") {
            plannerResult = {
              planned: true,
              intent: openAiAttempt.intent,
              assistantMessage: openAiAttempt.assistantMessage,
              plan: openAiAttempt.plan ?? undefined,
            };
            llmUsed = true;
            mcpUsed = false;
          } else if (openAiAttempt.status === "policy-blocked") {
            plannerResult = {
              planned: false,
              intent: openAiAttempt.intent,
              assistantMessage: openAiAttempt.assistantMessage,
            };
            llmUsed = true;
            mcpUsed = false;
          } else if (
            shouldAttemptOpenAi &&
            (openAiAttempt.status === "not-planned" ||
              openAiAttempt.status === "budget-blocked" ||
              openAiAttempt.status === "error")
          ) {
            fallbackUsed = true;
          }

          if (
            requireOpenAi &&
            !shouldExecuteDeterministic &&
            openAiAttempt.status !== "planned" &&
            openAiAttempt.status !== "policy-blocked"
          ) {
            const failure = getOpenAiRequiredErrorResponse(openAiAttempt);
            throw createHttpError(failure.status, failure.message);
          }

          if (!plannerResult) {
            const mcpSpan = activeTrace.startSpan("mcp.call", {
              endpoint: "/api/mcp/templates",
              tool: "command.plan",
            });
            const token = getInternalMcpToken();
            if (!token) {
              fallbackUsed = true;
              mcpUsed = false;
              mcpSpan.end({
                skipped: true,
                fallbackUsed: true,
                reason: "MCP_INTERNAL_TOKEN is missing.",
              });
              plannerResult = deterministicPlanResult;
            } else {
              try {
                plannerResult = await callCommandPlanTool({
                  endpointUrl: new URL(
                    "/api/mcp/templates",
                    request.nextUrl.origin,
                  ),
                  internalToken: token,
                  timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
                  message: parsedPayload.message,
                  selectedObjectIds,
                  boardState: boardObjects,
                  viewportBounds: parsedPayload.viewportBounds ?? null,
                });
                mcpSpan.end({
                  fallbackUsed: false,
                });
              } catch (error) {
                fallbackUsed = true;
                mcpUsed = false;
                mcpSpan.fail("MCP command planner failed.", {
                  reason: getErrorReason(error),
                });
                plannerResult = planDeterministicCommand({
                  message: parsedPayload.message,
                  boardState: boardObjects,
                  selectedObjectIds,
                  viewportBounds: parsedPayload.viewportBounds ?? null,
                });
              }
            }
          }

          const intentSpan = activeTrace.startSpan("ai.intent.detected", {
            intent: plannerResult.intent,
          });
          intentSpan.end({
            deterministic: !llmUsed,
            llmUsed,
            planned: plannerResult.planned,
          });

          if (!plannerResult.planned) {
            const execution = {
              intent: plannerResult.intent,
              mode: llmUsed ? ("llm" as const) : ("deterministic" as const),
              mcpUsed,
              fallbackUsed,
              toolCalls: 0,
              objectsCreated: 0,
              openAi: openAiExecution,
            };
            const payload = llmUsed
              ? buildOpenAiBoardCommandResponse({
                  assistantMessage: plannerResult.assistantMessage,
                  traceId,
                  execution,
                })
              : buildDeterministicBoardCommandResponse({
                  assistantMessage: plannerResult.assistantMessage,
                  traceId,
                  execution,
                });
            const payloadWithTrace = {
              ...payload,
              traceId: payload.traceId ?? traceId,
              ...(plannerResult.selectionUpdate
                ? { selectionUpdate: plannerResult.selectionUpdate }
                : {}),
            };

            const responseSpan = activeTrace.startSpan("ai.response.sent", {
              status: 200,
              provider: payloadWithTrace.provider,
            });
            responseSpan.end({
              traceId: payloadWithTrace.traceId ?? null,
            });
            activeTrace.finishSuccess({
              intent: plannerResult.intent,
              planned: false,
              mcpUsed,
              fallbackUsed,
              llmUsed,
            });
            return payloadWithTrace;
          }

          const clearBoardObjectIdsBeforeExecution =
            plannerResult.intent === "clear-board"
              ? boardObjects.map((objectItem) => objectItem.id)
              : null;

          let executionResult: {
            results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
            createdObjectIds: string[];
          };
          let executedOperationCount = 0;
          let executedOperations: BoardToolCall[] = [];

          if (openAiAttempt.status === "planned" && openAiAttempt.executedDirectly) {
            if (!openAiAttempt.directExecution) {
              throw createHttpError(
                500,
                "OpenAI agents runtime did not provide execution results.",
              );
            }
            executionResult = {
              results: openAiAttempt.directExecution.results,
              createdObjectIds: openAiAttempt.directExecution.createdObjectIds,
            };
            executedOperations = openAiAttempt.directExecution.operationsExecuted;
            executedOperationCount =
              openAiAttempt.directExecution.operationsExecuted.length;
          } else {
            const executionPlan = plannerResult.plan;
            if (!executionPlan) {
              throw createHttpError(500, "Planner returned no execution plan.");
            }

            const validation = validateTemplatePlan(executionPlan);
            if (!validation.ok) {
              throw createHttpError(validation.status, validation.error);
            }

            executionResult = await executePlanWithTracing({
              executor,
              trace: activeTrace,
              operations: executionPlan.operations,
            });
            executedOperations = executionPlan.operations;
            executedOperationCount = executionPlan.operations.length;
          }

          const commitSpan = activeTrace.startSpan("board.write.commit", {
            operationCount: executedOperationCount,
          });
          commitSpan.end({
            createdObjectCount: executionResult.createdObjectIds.length,
          });

          let assistantMessage = plannerResult.assistantMessage;
          if (plannerResult.intent === "clear-board") {
            const objectIdsAfterExecution = await listAllBoardObjectIds(
              parsedPayload.boardId,
            );
            if (objectIdsAfterExecution.length > 0) {
              await deleteBoardObjectsById(
                parsedPayload.boardId,
                objectIdsAfterExecution,
              );
            }

            const remainingObjectIds = await listAllBoardObjectIds(
              parsedPayload.boardId,
            );
            const objectCountBeforeExecution =
              clearBoardObjectIdsBeforeExecution?.length ?? boardObjects.length;

            assistantMessage = buildClearBoardAssistantMessage({
              deletedCount: Math.max(
                0,
                objectCountBeforeExecution - remainingObjectIds.length,
              ),
              remainingCount: remainingObjectIds.length,
            });
          } else if (llmUsed) {
            assistantMessage = buildOutcomeAssistantMessageFromExecution({
              fallbackAssistantMessage: plannerResult.assistantMessage,
              operations: executedOperations,
              createdObjectIds: executionResult.createdObjectIds,
              results: executionResult.results,
            });
          }

          const executedToolCalls =
            openAiAttempt.status === "planned" && openAiAttempt.executedDirectly
              ? openAiAttempt.directExecution?.toolCalls ??
                executionResult.results.length
              : executionResult.results.length;

          const execution = {
            intent: plannerResult.intent,
            mode: llmUsed ? ("llm" as const) : ("deterministic" as const),
            mcpUsed,
            fallbackUsed,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            openAi: openAiExecution,
          };
            const payload = llmUsed
              ? buildOpenAiBoardCommandResponse({
                  assistantMessage,
                  traceId,
                  execution,
                })
              : buildDeterministicBoardCommandResponse({
                  assistantMessage,
                  traceId,
                  execution,
                });
          const payloadWithTrace = {
            ...payload,
            traceId: payload.traceId ?? traceId,
            ...(plannerResult.selectionUpdate
              ? { selectionUpdate: plannerResult.selectionUpdate }
              : {}),
          };

          await writeAiAuditLogIfEnabled({
            boardId: parsedPayload.boardId,
            userId: user.uid,
            message: parsedPayload.message,
            traceId,
            fallbackUsed,
            mcpUsed,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            intent: plannerResult.intent,
          });

          const responseSpan = activeTrace.startSpan("ai.response.sent", {
            status: 200,
            provider: payloadWithTrace.provider,
          });
          responseSpan.end({
            traceId: payloadWithTrace.traceId ?? null,
          });

          activeTrace.finishSuccess({
            intent: plannerResult.intent,
            toolCalls: executedToolCalls,
            objectsCreated: executionResult.createdObjectIds.length,
            fallbackUsed,
            mcpUsed,
            llmUsed,
          });

          return payloadWithTrace;
        })(),
        AI_ROUTE_TIMEOUT_MS,
        "AI command timed out.",
      );

      return NextResponse.json(response);
    }

    if (!canEdit) {
      return NextResponse.json(
        { error: "You do not have edit access for AI mutation commands." },
        { status: 403 },
      );
    }

    throw createHttpError(500, "Unhandled AI command routing state.");
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }

    const errorWithStatus = error as { status?: unknown; message?: unknown };
    if (
      typeof errorWithStatus.status === "number" &&
      typeof errorWithStatus.message === "string"
    ) {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: errorWithStatus.status,
      });
      responseSpan?.fail(errorWithStatus.message);
      activeTrace?.finishError(errorWithStatus.message, {
        status: errorWithStatus.status,
      });
      return NextResponse.json(
        { error: errorWithStatus.message },
        { status: errorWithStatus.status },
      );
    }

    if (error instanceof Error && error.message === "AI command timed out.") {
      const responseSpan = activeTrace?.startSpan("ai.response.sent", {
        status: 504,
      });
      responseSpan?.fail(error.message);
      activeTrace?.finishError(error.message, {
        status: 504,
      });
      return NextResponse.json(
        { error: "AI command timed out." },
        { status: 504 },
      );
    }

    activeTrace?.finishError("Failed to handle board AI command.", {
      reason: getErrorReason(error),
    });
    const responseSpan = activeTrace?.startSpan("ai.response.sent", {
      status: 500,
    });
    responseSpan?.fail("Failed to handle board AI command.");

    console.error("Failed to handle board AI command", error);
    return NextResponse.json(
      {
        error: "Failed to handle board AI command.",
        debug: getDebugMessage(error),
      },
      { status: 500 },
    );
  } finally {
    if (boardLockId) {
      await releaseBoardCommandLock(boardLockId);
    }

    const flushTimeoutMs = getAiTraceFlushTimeoutMs();
    const [langfuseFlushResult, openAiFlushResult] = await Promise.allSettled([
      withTimeout(
        flushLangfuseClient(),
        flushTimeoutMs,
        "Langfuse trace flush timed out.",
      ),
      withTimeout(
        flushOpenAiTraces(),
        flushTimeoutMs,
        "OpenAI trace flush timed out.",
      ),
    ]);

    if (langfuseFlushResult.status === "rejected") {
      console.warn(
        "Failed to flush langfuse traces.",
        langfuseFlushResult.reason,
      );
    }
    if (openAiFlushResult.status === "rejected") {
      console.warn("Failed to flush openai traces.", openAiFlushResult.reason);
    }
  }
}
