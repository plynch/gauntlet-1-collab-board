import { URL } from "node:url";

import {
  buildClearBoardAssistantMessage,
  buildDeterministicBoardCommandResponse,
  buildOpenAiBoardCommandResponse,
  MCP_TEMPLATE_TIMEOUT_MS,
} from "@/features/ai/board-command";
import { validateTemplatePlan } from "@/features/ai/guardrails";
import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import { callCommandPlanTool } from "@/features/ai/mcp/template-mcp-client";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";
import { getOpenAiRequiredErrorResponse } from "@/features/ai/openai/openai-required-response";
import { shouldExecuteDeterministicPlan } from "@/features/ai/server/board-command-deterministic-policy";
import { attemptOpenAiPlanner } from "@/features/ai/server/board-command-openai-attempt";
import { buildOpenAiExecutionSummary, isOpenAiRequiredForStubCommands } from "@/features/ai/server/board-command-openai-types";
import { buildOutcomeAssistantMessageFromExecution } from "@/features/ai/server/board-command-plan-trace";
import { deleteBoardObjectsById, executePlanWithTracing, listAllBoardObjectIds, writeAiAuditLogIfEnabled } from "@/features/ai/server/board-command-plan-executor";
import { createHttpError, getErrorReason, getInternalMcpToken } from "@/features/ai/server/board-command-runtime-config";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type { BoardToolCall, TemplatePlan, ViewportBounds } from "@/features/ai/types";
import type { createAiTraceRun } from "@/features/ai/observability/trace-run";

type PlannerResult = {
  planned: boolean;
  intent: string;
  assistantMessage: string;
  plan?: TemplatePlan;
  selectionUpdate?: {
    mode: "clear" | "replace";
    objectIds: string[];
  };
};

type EditableFlowParams = {
  boardId: string;
  message: string;
  userId: string;
  requestOrigin: string;
  selectedObjectIds?: string[];
  viewportBounds?: ViewportBounds | null;
  traceId: string;
  trace: ReturnType<typeof createAiTraceRun>;
};

export async function runEditableBoardCommandFlow(
  params: EditableFlowParams,
) {
  const executor = new BoardToolExecutor({
    boardId: params.boardId,
    userId: params.userId,
  });
  const stateSpan = params.trace.startSpan("ai.request.received", {
    selectedObjectCount: params.selectedObjectIds?.length ?? 0,
  });
  const boardObjects = await executor.getBoardState();
  stateSpan.end({ existingObjectCount: boardObjects.length });
  const selectedObjectIds = params.selectedObjectIds ?? [];
  const openAiConfig = getOpenAiPlannerConfig();
  const plannerMode = openAiConfig.plannerMode;
  const requireOpenAi = plannerMode === "openai-strict" || isOpenAiRequiredForStubCommands();
  const deterministicPlanResult = planDeterministicCommand({
    message: params.message,
    boardState: boardObjects,
    selectedObjectIds,
    viewportBounds: params.viewportBounds ?? null,
  });
  const forceDeterministicForClearIntent =
    deterministicPlanResult.intent === "clear-board" ||
    deterministicPlanResult.intent === "clear-board-empty";
  const shouldExecuteDeterministic = forceDeterministicForClearIntent || (
    deterministicPlanResult.planned &&
    shouldExecuteDeterministicPlan(plannerMode, deterministicPlanResult.intent)
  );
  const shouldAttemptOpenAi =
    plannerMode !== "deterministic-only" && !shouldExecuteDeterministic;

  const openAiAttempt = shouldAttemptOpenAi
    ? await attemptOpenAiPlanner({
        message: params.message,
        boardId: params.boardId,
        userId: params.userId,
        boardState: boardObjects,
        selectedObjectIds,
        viewportBounds: params.viewportBounds ?? null,
        executor,
        trace: params.trace,
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

  let plannerResult: PlannerResult | null = null;
  let fallbackUsed = false;
  let mcpUsed = true;
  let llmUsed = false;

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
    const mcpSpan = params.trace.startSpan("mcp.call", {
      endpoint: "/api/mcp/templates",
      tool: "command.plan",
    });
    const token = getInternalMcpToken();
    if (!token) {
      fallbackUsed = true;
      mcpUsed = false;
      mcpSpan.end({ skipped: true, fallbackUsed: true, reason: "MCP_INTERNAL_TOKEN is missing." });
      plannerResult = deterministicPlanResult;
    } else {
      try {
        plannerResult = await callCommandPlanTool({
          endpointUrl: new URL("/api/mcp/templates", params.requestOrigin),
          internalToken: token,
          timeoutMs: MCP_TEMPLATE_TIMEOUT_MS,
          message: params.message,
          selectedObjectIds,
          boardState: boardObjects,
          viewportBounds: params.viewportBounds ?? null,
        });
        mcpSpan.end({ fallbackUsed: false });
      } catch (error) {
        fallbackUsed = true;
        mcpUsed = false;
        mcpSpan.fail("MCP command planner failed.", { reason: getErrorReason(error) });
        plannerResult = planDeterministicCommand({
          message: params.message,
          boardState: boardObjects,
          selectedObjectIds,
          viewportBounds: params.viewportBounds ?? null,
        });
      }
    }
  }

  const intentSpan = params.trace.startSpan("ai.intent.detected", { intent: plannerResult.intent });
  intentSpan.end({ deterministic: !llmUsed, llmUsed, planned: plannerResult.planned });

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
      ? buildOpenAiBoardCommandResponse({ assistantMessage: plannerResult.assistantMessage, traceId: params.traceId, execution })
      : buildDeterministicBoardCommandResponse({ assistantMessage: plannerResult.assistantMessage, traceId: params.traceId, execution });
    const payloadWithTrace = {
      ...payload,
      traceId: payload.traceId ?? params.traceId,
      ...(plannerResult.selectionUpdate ? { selectionUpdate: plannerResult.selectionUpdate } : {}),
    };
    return { payloadWithTrace, plannerResult, fallbackUsed, llmUsed, mcpUsed };
  }

  const clearBoardObjectIdsBeforeExecution =
    plannerResult.intent === "clear-board" ? boardObjects.map((objectItem) => objectItem.id) : null;
  let executionResult: { results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[]; createdObjectIds: string[] };
  let executedOperationCount = 0;
  let executedOperations: BoardToolCall[] = [];

  if (openAiAttempt.status === "planned" && openAiAttempt.executedDirectly) {
    if (!openAiAttempt.directExecution) {
      throw createHttpError(500, "OpenAI agents runtime did not provide execution results.");
    }
    executionResult = {
      results: openAiAttempt.directExecution.results,
      createdObjectIds: openAiAttempt.directExecution.createdObjectIds,
    };
    executedOperations = openAiAttempt.directExecution.operationsExecuted;
    executedOperationCount = openAiAttempt.directExecution.operationsExecuted.length;
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
      trace: params.trace,
      operations: executionPlan.operations,
    });
    executedOperations = executionPlan.operations;
    executedOperationCount = executionPlan.operations.length;
  }

  const commitSpan = params.trace.startSpan("board.write.commit", { operationCount: executedOperationCount });
  commitSpan.end({ createdObjectCount: executionResult.createdObjectIds.length });
  let assistantMessage = plannerResult.assistantMessage;
  if (plannerResult.intent === "clear-board") {
    const objectIdsAfterExecution = await listAllBoardObjectIds(params.boardId);
    if (objectIdsAfterExecution.length > 0) {
      await deleteBoardObjectsById(params.boardId, objectIdsAfterExecution);
    }
    const remainingObjectIds = await listAllBoardObjectIds(params.boardId);
    const objectCountBeforeExecution = clearBoardObjectIdsBeforeExecution?.length ?? boardObjects.length;
    assistantMessage = buildClearBoardAssistantMessage({
      deletedCount: Math.max(0, objectCountBeforeExecution - remainingObjectIds.length),
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

  const executedToolCalls = openAiAttempt.status === "planned" && openAiAttempt.executedDirectly
    ? openAiAttempt.directExecution?.toolCalls ?? executionResult.results.length
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
    ? buildOpenAiBoardCommandResponse({ assistantMessage, traceId: params.traceId, execution })
    : buildDeterministicBoardCommandResponse({ assistantMessage, traceId: params.traceId, execution });
  const payloadWithTrace = {
    ...payload,
    traceId: payload.traceId ?? params.traceId,
    ...(plannerResult.selectionUpdate ? { selectionUpdate: plannerResult.selectionUpdate } : {}),
  };
  await writeAiAuditLogIfEnabled({
    boardId: params.boardId,
    userId: params.userId,
    message: params.message,
    traceId: params.traceId,
    fallbackUsed,
    mcpUsed,
    toolCalls: executedToolCalls,
    objectsCreated: executionResult.createdObjectIds.length,
    intent: plannerResult.intent,
  });
  return { payloadWithTrace, plannerResult, fallbackUsed, llmUsed, mcpUsed };
}
