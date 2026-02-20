export type OpenAiRequiredAttempt =
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
 * Gets openai required error response.
 */
export function getOpenAiRequiredErrorResponse(
  openAiAttempt: OpenAiRequiredAttempt,
): {
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

  return {
    status: 502,
    message: `OpenAI-required mode failed during planner call. ${openAiAttempt.reason}`,
  };
}
