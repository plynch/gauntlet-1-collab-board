import type { BoardToolCall, TemplatePlan } from "@/features/ai/types";
import type { BoardToolExecutor } from "@/features/ai/tools/board-tools";

export type OpenAiUsageSummary = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type OpenAiPlanAttempt =
  | {
      status: "disabled";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      reason: string;
    }
  | {
      status: "budget-blocked";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      assistantMessage: string;
      totalSpentUsd: number;
    }
  | {
      status: "policy-blocked";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      intent: "create-object-limit-exceeded";
      assistantMessage: string;
      requestedCount: number;
      maxAllowedCount: number;
      totalSpentUsd: number;
    }
  | {
      status: "planned";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      intent: string;
      assistantMessage: string;
      openAiTraceId?: string;
      plan: TemplatePlan | null;
      executedDirectly: boolean;
      directExecution?: {
        operationsExecuted: BoardToolCall[];
        results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
        createdObjectIds: string[];
        deletedCount: number;
        toolCalls: number;
        responseId?: string;
      };
      totalSpentUsd: number;
      usage: OpenAiUsageSummary;
    }
  | {
      status: "not-planned";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      intent: string;
      assistantMessage: string;
      openAiTraceId?: string;
      totalSpentUsd: number;
      usage: OpenAiUsageSummary;
    }
  | {
      status: "error";
      model: string;
      runtime: "agents-sdk" | "chat-completions";
      reason: string;
      totalSpentUsd?: number;
      usage?: OpenAiUsageSummary;
    };

export function buildOpenAiExecutionSummary(openAiAttempt: OpenAiPlanAttempt): {
  attempted: boolean;
  status:
    | "disabled"
    | "budget-blocked"
    | "policy-blocked"
    | "planned"
    | "not-planned"
    | "error";
  model: string;
  runtime: "agents-sdk" | "chat-completions";
  traceId?: string;
  estimatedCostUsd: number;
  totalSpentUsd?: number;
} {
  if (openAiAttempt.status === "disabled") {
    return {
      attempted: false,
      status: "disabled",
      model: openAiAttempt.model,
      runtime: openAiAttempt.runtime,
      estimatedCostUsd: 0,
    };
  }
  if (openAiAttempt.status === "budget-blocked") {
    return {
      attempted: true,
      status: "budget-blocked",
      model: openAiAttempt.model,
      runtime: openAiAttempt.runtime,
      estimatedCostUsd: 0,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }
  if (openAiAttempt.status === "policy-blocked") {
    return {
      attempted: true,
      status: "policy-blocked",
      model: openAiAttempt.model,
      runtime: openAiAttempt.runtime,
      estimatedCostUsd: 0,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }
  if (openAiAttempt.status === "planned") {
    return {
      attempted: true,
      status: "planned",
      model: openAiAttempt.model,
      runtime: openAiAttempt.runtime,
      ...(openAiAttempt.openAiTraceId
        ? { traceId: openAiAttempt.openAiTraceId }
        : {}),
      estimatedCostUsd: openAiAttempt.usage.estimatedCostUsd,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }
  if (openAiAttempt.status === "not-planned") {
    return {
      attempted: true,
      status: "not-planned",
      model: openAiAttempt.model,
      runtime: openAiAttempt.runtime,
      ...(openAiAttempt.openAiTraceId
        ? { traceId: openAiAttempt.openAiTraceId }
        : {}),
      estimatedCostUsd: openAiAttempt.usage.estimatedCostUsd,
      totalSpentUsd: openAiAttempt.totalSpentUsd,
    };
  }

  return {
    attempted: true,
    status: "error",
    model: openAiAttempt.model,
    runtime: openAiAttempt.runtime,
    estimatedCostUsd: openAiAttempt.usage?.estimatedCostUsd ?? 0,
    ...(typeof openAiAttempt.totalSpentUsd === "number"
      ? { totalSpentUsd: openAiAttempt.totalSpentUsd }
      : {}),
  };
}

export function getOpenAiUsageFromError(error: unknown): OpenAiUsageSummary | null {
  const usageCandidate = (error as { usage?: unknown } | null)?.usage;
  if (!usageCandidate || typeof usageCandidate !== "object") {
    return null;
  }
  const usage = usageCandidate as {
    model?: unknown;
    inputTokens?: unknown;
    outputTokens?: unknown;
    totalTokens?: unknown;
    estimatedCostUsd?: unknown;
  };

  if (
    typeof usage.model !== "string" ||
    typeof usage.inputTokens !== "number" ||
    typeof usage.outputTokens !== "number" ||
    typeof usage.totalTokens !== "number" ||
    typeof usage.estimatedCostUsd !== "number"
  ) {
    return null;
  }

  return {
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd: usage.estimatedCostUsd,
  };
}

export function isOpenAiRequiredForStubCommands(): boolean {
  return process.env.AI_REQUIRE_OPENAI === "true";
}
