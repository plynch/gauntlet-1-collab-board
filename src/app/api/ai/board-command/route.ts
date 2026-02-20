import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { Serialized } from "@langchain/core/load/serializable";

import {
  buildClearBoardAssistantMessage,
  buildDeterministicBoardCommandResponse,
  buildOpenAiBoardCommandResponse,
  buildSwotAssistantMessage,
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
  callTemplateInstantiateTool,
} from "@/features/ai/mcp/template-mcp-client";
import { LangChainLangfuseCallbackHandler } from "@/features/ai/observability/langchain-langfuse-handler";
import { flushLangfuseClient } from "@/features/ai/observability/langfuse-client";
import { createAiTraceRun } from "@/features/ai/observability/trace-run";
import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import {
  finalizeOpenAiBudgetReservation,
  releaseOpenAiBudgetReservation,
  reserveOpenAiBudget,
} from "@/features/ai/openai/openai-cost-controls";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";
import {
  type OpenAiPlannerFailureError,
  planBoardCommandWithOpenAi,
} from "@/features/ai/openai/openai-command-planner";
import { instantiateLocalTemplate } from "@/features/ai/templates/local-template-provider";
import { SWOT_TEMPLATE_ID } from "@/features/ai/templates/template-types";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type {
  BoardBounds,
  BoardObjectSnapshot,
  BoardToolCall,
  TemplatePlan,
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

/**
 * Returns whether ai audit enabled is true.
 */
function isAiAuditEnabled(): boolean {
  return process.env.AI_AUDIT_LOG_ENABLED === "true";
}

/**
 * Gets internal mcp token.
 */
function getInternalMcpToken(): string | null {
  const value = process.env.MCP_INTERNAL_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

/**
 * Gets traceable error reason.
 */
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

/**
 * Gets debug message.
 */
function getDebugMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  return getErrorReason(error);
}

/**
 * Returns whether clear-board request message is true.
 */
function isClearBoardRequestMessage(message: string): boolean {
  const lower = message.trim().toLowerCase();
  return (
    /\bclear(?:\s+the)?\s+board\b/.test(lower) ||
    /\bdelete\s+all\s+shapes\b/.test(lower) ||
    /\bremove\s+all\s+shapes\b/.test(lower) ||
    /\b(?:delete|remove)\s+everything(?:\s+on\s+the\s+board)?\b/.test(lower) ||
    /\bwipe\s+the\s+board\b/.test(lower)
  );
}

/**
 * Creates http error.
 */
function createHttpError(
  status: number,
  message: string,
): Error & { status: number } {
  const error = new Error(message) as Error & { status: number };
  error.status = status;
  return error;
}

const DIRECT_DELETE_BATCH_CHUNK_SIZE = 400;
const OPENAI_TRACE_OPERATIONS_PREVIEW_LIMIT = 3;
const OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS = 1_200;
const LANGCHAIN_TOOL_PLAN_SERIALIZED: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["collabboard", "ai", "tool-plan"],
};

/**
 * Handles to serialized tool.
 */
function toSerializedTool(toolName: BoardToolCall["tool"]): Serialized {
  return {
    lc: 1,
    type: "not_implemented",
    id: ["collabboard", "ai", "tool", toolName],
  };
}

/**
 * Returns whether tool call creates object is true.
 */
function createsObject(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

type OpenAiPlanAttempt =
  | {
      status: "disabled";
      model: string;
      reason: string;
    }
  | {
      status: "budget-blocked";
      model: string;
      assistantMessage: string;
      totalSpentUsd: number;
    }
  | {
      status: "planned";
      model: string;
      intent: string;
      assistantMessage: string;
      plan: TemplatePlan;
      totalSpentUsd: number;
      usage: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
    }
  | {
      status: "not-planned";
      model: string;
      intent: string;
      assistantMessage: string;
      totalSpentUsd: number;
      usage: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
    }
  | {
      status: "error";
      model: string;
      reason: string;
      totalSpentUsd?: number;
      usage?: {
        model: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        estimatedCostUsd: number;
      };
    };

/**
 * Handles build openai plan trace fields.
 */
function buildOpenAiPlanTraceFields(
  plan: TemplatePlan | null | undefined,
): {
  operationCount: number;
  operationsPreviewJson: string;
  firstOperationTool: string | null;
  firstOperationX: number | null;
  firstOperationY: number | null;
} {
  const operations = plan?.operations ?? [];
  const operationsPreview = operations
    .slice(0, OPENAI_TRACE_OPERATIONS_PREVIEW_LIMIT)
    .map((operation) => ({
      tool: operation.tool,
      args: operation.args ?? {},
    }));

  const previewJson = JSON.stringify(operationsPreview);
  const operationsPreviewJson =
    previewJson.length <= OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS
      ? previewJson
      : `${previewJson.slice(0, OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS)}…`;

  const firstOperation = operationsPreview[0];
  const firstArgs =
    firstOperation && firstOperation.args && typeof firstOperation.args === "object"
      ? (firstOperation.args as Record<string, unknown>)
      : null;
  const firstOperationX =
    firstArgs && typeof firstArgs.x === "number" ? firstArgs.x : null;
  const firstOperationY =
    firstArgs && typeof firstArgs.y === "number" ? firstArgs.y : null;

  return {
    operationCount: operations.length,
    operationsPreviewJson,
    firstOperationTool: firstOperation?.tool ?? null,
    firstOperationX,
    firstOperationY,
  };
}

/**
 * Builds openai execution summary.
 */
function buildOpenAiExecutionSummary(openAiAttempt: OpenAiPlanAttempt): {
  attempted: boolean;
  status: "disabled" | "budget-blocked" | "planned" | "not-planned" | "error";
  model: string;
  estimatedCostUsd: number;
  totalSpentUsd?: number;
} {
  if (openAiAttempt.status === "disabled") {
    return {
      attempted: false,
      status: "disabled",
      model: openAiAttempt.model,
      estimatedCostUsd: 0,
    };
  }

  if (openAiAttempt.status === "budget-blocked") {
    return {
      attempted: true,
      status: "budget-blocked",
      model: openAiAttempt.model,
      estimatedCostUsd: 0,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }

  if (openAiAttempt.status === "planned") {
    return {
      attempted: true,
      status: "planned",
      model: openAiAttempt.model,
      estimatedCostUsd: openAiAttempt.usage.estimatedCostUsd,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }

  if (openAiAttempt.status === "not-planned") {
    return {
      attempted: true,
      status: "not-planned",
      model: openAiAttempt.model,
      estimatedCostUsd: openAiAttempt.usage.estimatedCostUsd,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }

  return {
    attempted: true,
    status: "error",
    model: openAiAttempt.model,
    estimatedCostUsd: openAiAttempt.usage?.estimatedCostUsd ?? 0,
    ...(typeof openAiAttempt.totalSpentUsd === "number"
      ? { totalSpentUsd: openAiAttempt.totalSpentUsd }
      : {}),
  };
}

/**
 * Gets openai usage from planner error.
 */
function getOpenAiUsageFromError(error: unknown): {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
} | null {
  const usage = (error as OpenAiPlannerFailureError | null)?.usage;
  if (!usage) {
    return null;
  }

  if (
    typeof usage.model !== "string" ||
    typeof usage.inputTokens !== "number" ||
    typeof usage.outputTokens !== "number" ||
    typeof usage.totalTokens !== "number" ||
    typeof usage.estimatedCostUsd !== "number"
  ) {
    return null;
  }

  return usage;
}

/**
 * Returns whether openai is required for stub commands is true.
 */
function isOpenAiRequiredForStubCommands(): boolean {
  return process.env.AI_REQUIRE_OPENAI === "true";
}

/**
 * Gets openai required error response.
 */
function getOpenAiRequiredErrorResponse(openAiAttempt: OpenAiPlanAttempt): {
  status: number;
  message: string;
} {
  if (openAiAttempt.status === "disabled") {
    return {
      status: 503,
      message: `OpenAI-required mode is enabled, but OpenAI planner is disabled. ${openAiAttempt.reason}`,
    };
  }

  if (openAiAttempt.status === "budget-blocked") {
    return {
      status: 429,
      message: `OpenAI-required mode blocked by budget policy. ${openAiAttempt.assistantMessage}`,
    };
  }

  if (openAiAttempt.status === "not-planned") {
    return {
      status: 422,
      message: `OpenAI-required mode received planned=false for intent "${openAiAttempt.intent}". ${openAiAttempt.assistantMessage}`,
    };
  }

  if (openAiAttempt.status === "error") {
    return {
      status: 502,
      message: `OpenAI-required mode failed during planner call. ${openAiAttempt.reason}`,
    };
  }

  return {
    status: 500,
    message: "OpenAI-required mode received an unsupported planner status.",
  };
}

/**
 * Handles attempt openai planner.
 */
async function attemptOpenAiPlanner(options: {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  trace: ReturnType<typeof createAiTraceRun>;
}): Promise<OpenAiPlanAttempt> {
  const config = getOpenAiPlannerConfig();
  if (!config.enabled) {
    return {
      status: "disabled",
      model: config.model,
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
      assistantMessage: budgetReservation.error,
      totalSpentUsd: budgetReservation.totalSpentUsd,
    };
  }
  budgetSpan.end({
    totalSpentUsd: budgetReservation.totalSpentUsd,
  });

  let reservationOpen = true;
  const openAiSpan = options.trace.startSpan("openai.call", {
    model: config.model,
    messagePreview: options.message.slice(0, 240),
  });

  try {
    const plannerResult = await planBoardCommandWithOpenAi({
      message: options.message,
      boardState: options.boardState,
      selectedObjectIds: options.selectedObjectIds,
    });
    const planTraceFields = buildOpenAiPlanTraceFields(plannerResult.plan);

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
      operationCount: planTraceFields.operationCount,
      operationsPreviewJson: planTraceFields.operationsPreviewJson,
      firstOperationTool: planTraceFields.firstOperationTool,
      firstOperationX: planTraceFields.firstOperationX,
      firstOperationY: planTraceFields.firstOperationY,
    });

    if (!plannerResult.planned || !plannerResult.plan) {
      return {
        status: "not-planned",
        model: config.model,
        intent: plannerResult.intent,
        assistantMessage: plannerResult.assistantMessage,
        totalSpentUsd: finalized.totalSpentUsd,
        usage: plannerResult.usage,
      };
    }

    return {
      status: "planned",
      model: config.model,
      intent: plannerResult.intent,
      assistantMessage: plannerResult.assistantMessage,
      plan: plannerResult.plan,
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
      reason,
      ...(usage ? { usage } : {}),
      ...(typeof totalSpentUsd === "number" ? { totalSpentUsd } : {}),
    };
  }
}

/**
 * Handles execute plan with tracing.
 */
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
  const createdObjectIds: string[] = [];
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
      const toolRun = await toolManager.handleToolStart(
        toSerializedTool(operation.tool),
        JSON.stringify(operation.args ?? {}),
        undefined,
        undefined,
        ["board-tool-call"],
        {
          operationIndex: index,
          tool: operation.tool,
        },
        operation.tool,
      );

      try {
        const result = await options.executor.executeToolCall(operation);
        results.push(result);

        if (result.objectId && createsObject(operation)) {
          createdObjectIds.push(result.objectId);
        }

        await toolRun.handleToolEnd({
          objectId: result.objectId ?? null,
          deletedCount: result.deletedCount ?? 0,
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
      createdObjectIds,
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

/**
 * Handles list all board object ids.
 */
async function listAllBoardObjectIds(boardId: string): Promise<string[]> {
  const snapshot = await getFirebaseAdminDb()
    .collection("boards")
    .doc(boardId)
    .collection("objects")
    .get();
  return snapshot.docs.map((documentSnapshot) => documentSnapshot.id);
}

/**
 * Handles delete board objects by id.
 */
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

/**
 * Handles to board bounds.
 */
function toBoardBounds(objects: BoardObjectSnapshot[]): BoardBounds | null {
  if (objects.length === 0) {
    return null;
  }

  const left = Math.min(...objects.map((objectItem) => objectItem.x));
  const top = Math.min(...objects.map((objectItem) => objectItem.y));
  const right = Math.max(
    ...objects.map((objectItem) => objectItem.x + objectItem.width),
  );
  const bottom = Math.max(
    ...objects.map((objectItem) => objectItem.y + objectItem.height),
  );

  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/**
 * Handles write ai audit log if enabled.
 */
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

/**
 * Handles post.
 */
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

    if (intent === "stub" && canEdit) {
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
          intent: "deterministic-command-planner",
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
              }
            | null = null;
          let fallbackUsed = false;
          let mcpUsed = true;
          let llmUsed = false;
          const selectedObjectIds = parsedPayload.selectedObjectIds ?? [];
          const requireOpenAi = isOpenAiRequiredForStubCommands();
          const shouldForceDeterministicClearBoard = isClearBoardRequestMessage(
            parsedPayload.message,
          );

          const openAiAttempt = shouldForceDeterministicClearBoard
            ? {
                status: "disabled" as const,
                model: getOpenAiPlannerConfig().model,
                reason: "Skipped for deterministic clear-board policy.",
              }
            : await attemptOpenAiPlanner({
                message: parsedPayload.message,
                boardState: boardObjects,
                selectedObjectIds,
                trace: activeTrace,
              });
          const openAiExecution = buildOpenAiExecutionSummary(openAiAttempt);
          if (openAiAttempt.status === "planned") {
            plannerResult = {
              planned: true,
              intent: openAiAttempt.intent,
              assistantMessage: openAiAttempt.assistantMessage,
              plan: openAiAttempt.plan,
            };
            llmUsed = true;
            mcpUsed = false;
          } else if (
            openAiAttempt.status === "not-planned" ||
            openAiAttempt.status === "budget-blocked" ||
            openAiAttempt.status === "error"
          ) {
            fallbackUsed = true;
          }

          if (requireOpenAi && openAiAttempt.status !== "planned") {
            const failure = getOpenAiRequiredErrorResponse(openAiAttempt);
            throw createHttpError(failure.status, failure.message);
          }

          if (!plannerResult) {
            if (shouldForceDeterministicClearBoard) {
              fallbackUsed = true;
              mcpUsed = false;
              const mcpSpan = activeTrace.startSpan("mcp.call", {
                endpoint: "/api/mcp/templates",
                tool: "command.plan",
              });
              mcpSpan.end({
                skipped: true,
                fallbackUsed: true,
                reason: "Deterministic clear-board policy.",
              });
              plannerResult = planDeterministicCommand({
                message: parsedPayload.message,
                boardState: boardObjects,
                selectedObjectIds,
                viewportBounds: parsedPayload.viewportBounds ?? null,
              });
            } else {
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
                plannerResult = planDeterministicCommand({
                  message: parsedPayload.message,
                  boardState: boardObjects,
                  selectedObjectIds,
                  viewportBounds: parsedPayload.viewportBounds ?? null,
                });
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

            const responseSpan = activeTrace.startSpan("ai.response.sent", {
              status: 200,
              provider: payload.provider,
            });
            responseSpan.end({
              traceId: payload.traceId ?? null,
            });
            activeTrace.finishSuccess({
              intent: plannerResult.intent,
              planned: false,
              mcpUsed,
              fallbackUsed,
              llmUsed,
            });
            return payload;
          }

          const clearBoardObjectIdsBeforeExecution =
            plannerResult.intent === "clear-board"
              ? await listAllBoardObjectIds(parsedPayload.boardId)
              : null;

          const executionPlan = plannerResult.plan;
          if (!executionPlan) {
            throw createHttpError(500, "Planner returned no execution plan.");
          }

          const validation = validateTemplatePlan(executionPlan);
          if (!validation.ok) {
            throw createHttpError(validation.status, validation.error);
          }

          const executionResult = await executePlanWithTracing({
            executor,
            trace: activeTrace,
            operations: executionPlan.operations,
          });

          const commitSpan = activeTrace.startSpan("board.write.commit", {
            operationCount: executionPlan.operations.length,
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
          }

          const execution = {
            intent: plannerResult.intent,
            mode: llmUsed ? ("llm" as const) : ("deterministic" as const),
            mcpUsed,
            fallbackUsed,
            toolCalls: executionResult.results.length,
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

          await writeAiAuditLogIfEnabled({
            boardId: parsedPayload.boardId,
            userId: user.uid,
            message: parsedPayload.message,
            traceId,
            fallbackUsed,
            mcpUsed,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length,
            intent: plannerResult.intent,
          });

          const responseSpan = activeTrace.startSpan("ai.response.sent", {
            status: 200,
            provider: payload.provider,
          });
          responseSpan.end({
            traceId: payload.traceId ?? null,
          });

          activeTrace.finishSuccess({
            intent: plannerResult.intent,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length,
            fallbackUsed,
            mcpUsed,
            llmUsed,
          });

          return payload;
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

        const intentSpan = activeTrace.startSpan("ai.intent.detected", {
          intent,
        });
        intentSpan.end({
          deterministic: true,
        });

        const templateInput = {
          templateId: SWOT_TEMPLATE_ID,
          boardBounds: toBoardBounds(boardObjects),
          viewportBounds: parsedPayload.viewportBounds ?? null,
          selectedObjectIds: parsedPayload.selectedObjectIds ?? [],
          existingObjectCount: boardObjects.length,
        };

        let fallbackUsed = false;
        let mcpUsed = true;
        let templateOutput;

        const mcpSpan = activeTrace.startSpan("mcp.call", {
          endpoint: "/api/mcp/templates",
          templateId: templateInput.templateId,
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
          templateOutput = instantiateLocalTemplate(templateInput);
        } else {
          try {
            templateOutput = await callTemplateInstantiateTool({
              endpointUrl: new URL("/api/mcp/templates", request.nextUrl.origin),
              internalToken: token,
              timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
              input: templateInput,
            });
            mcpSpan.end({
              fallbackUsed: false,
            });
          } catch (error) {
            fallbackUsed = true;
            mcpUsed = false;
            mcpSpan.fail("MCP template call failed.", {
              reason: getErrorReason(error),
            });
            templateOutput = instantiateLocalTemplate(templateInput);
          }
        }

        const validation = validateTemplatePlan(templateOutput.plan);
        if (!validation.ok) {
          throw createHttpError(validation.status, validation.error);
        }

        const executionResult = await executePlanWithTracing({
          executor,
          trace: activeTrace,
          operations: templateOutput.plan.operations,
        });

        const commitSpan = activeTrace.startSpan("board.write.commit", {
          operationCount: templateOutput.plan.operations.length,
        });
        commitSpan.end({
          createdObjectCount: executionResult.createdObjectIds.length,
        });

        const assistantMessage = buildSwotAssistantMessage({
          fallbackUsed,
          objectsCreated: executionResult.createdObjectIds.length,
        });

        const payload = buildDeterministicBoardCommandResponse({
          assistantMessage,
          traceId,
          execution: {
            intent: "swot-template",
            mode: "deterministic",
            mcpUsed,
            fallbackUsed,
            toolCalls: executionResult.results.length,
            objectsCreated: executionResult.createdObjectIds.length,
          },
        });

        await writeAiAuditLogIfEnabled({
          boardId: parsedPayload.boardId,
          userId: user.uid,
          message: parsedPayload.message,
          traceId,
          fallbackUsed,
          mcpUsed,
          toolCalls: executionResult.results.length,
          objectsCreated: executionResult.createdObjectIds.length,
          intent,
        });

        const responseSpan = activeTrace.startSpan("ai.response.sent", {
          status: 200,
          provider: payload.provider,
        });
        responseSpan.end({
          traceId: payload.traceId ?? null,
        });

        activeTrace.finishSuccess({
          toolCalls: executionResult.results.length,
          objectsCreated: executionResult.createdObjectIds.length,
          fallbackUsed,
          mcpUsed,
        });

        return payload;
      })(),
      AI_ROUTE_TIMEOUT_MS,
      "AI command timed out.",
    );

    return NextResponse.json(response);
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
    await flushLangfuseClient();
  }
}
