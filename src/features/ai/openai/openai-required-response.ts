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
 * Handles to safe openai reason.
 */
function toSafeOpenAiReason(reason: string): string {
  const normalized = reason.toLowerCase();
  if (
    normalized.includes("incorrect api key provided") ||
    normalized.includes("invalid api key")
  ) {
    return "OpenAI API key is invalid or revoked. Update OPENAI_API_KEY in App Hosting secrets and redeploy.";
  }

  return reason.replace(/sk-[a-z0-9_-]+/gi, "sk-REDACTED");
}

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
      message:
        openAiAttempt.assistantMessage.trim() ||
        "I could not map that command safely.",
    };
  }

  return {
    status: 502,
    message: `OpenAI-required mode failed during planner call. ${toSafeOpenAiReason(openAiAttempt.reason)}`,
  };
}
