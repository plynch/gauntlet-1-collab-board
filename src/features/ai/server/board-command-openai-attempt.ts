import { parseCoordinateHintsFromMessage } from "@/features/ai/commands/coordinate-hints";
import {
  finalizeOpenAiBudgetReservation,
  releaseOpenAiBudgetReservation,
  reserveOpenAiBudget,
} from "@/features/ai/openai/openai-cost-controls";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";
import { planBoardCommandWithOpenAi } from "@/features/ai/openai/openai-command-planner";
import { runBoardCommandWithOpenAiAgents } from "@/features/ai/openai/agents/openai-agents-runner";
import { parseMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";
import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import {
  buildOperationCountsByTool,
  buildOpenAiPlanTraceFields,
} from "@/features/ai/server/board-command-plan-trace";
import {
  getOpenAiUsageFromError,
  type OpenAiPlanAttempt,
} from "@/features/ai/server/board-command-openai-types";
import { getErrorReason } from "@/features/ai/server/board-command-runtime-config";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type { BoardObjectSnapshot, TemplatePlan, ViewportBounds } from "@/features/ai/types";

type AttemptOpenAiPlannerOptions = {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  viewportBounds: ViewportBounds | null;
  boardId: string;
  userId: string;
  executor: BoardToolExecutor;
  trace: AiTraceRun;
};

export async function attemptOpenAiPlanner(
  options: AttemptOpenAiPlannerOptions,
): Promise<OpenAiPlanAttempt> {
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
