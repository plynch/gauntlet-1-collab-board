import OpenAI from "openai";

type OpenAiPlannerConfig = {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  maxOutputTokens: number;
  reserveUsdPerCall: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
  maxContextObjects: number;
};

let openAiClient: OpenAI | null | undefined;

/**
 * Parses positive number env.
 */
function parsePositiveNumberEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

/**
 * Parses positive integer env.
 */
function parsePositiveIntegerEnv(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.max(1, Math.floor(parsed));
}

/**
 * Gets openai planner config.
 */
export function getOpenAiPlannerConfig(): OpenAiPlannerConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-nano";
  const enabled =
    process.env.AI_ENABLE_OPENAI !== "false" && Boolean(apiKey && model);

  return {
    enabled,
    apiKey,
    baseUrl,
    model,
    maxOutputTokens: parsePositiveIntegerEnv(
      process.env.OPENAI_MAX_OUTPUT_TOKENS,
      700,
    ),
    reserveUsdPerCall: parsePositiveNumberEnv(
      process.env.OPENAI_RESERVE_USD_PER_CALL,
      0.003,
    ),
    inputCostPerMillionUsd: parsePositiveNumberEnv(
      process.env.OPENAI_INPUT_COST_PER_1M_USD,
      0.1,
    ),
    outputCostPerMillionUsd: parsePositiveNumberEnv(
      process.env.OPENAI_OUTPUT_COST_PER_1M_USD,
      0.4,
    ),
    maxContextObjects: parsePositiveIntegerEnv(
      process.env.OPENAI_MAX_CONTEXT_OBJECTS,
      120,
    ),
  };
}

/**
 * Gets openai client.
 */
export function getOpenAiClient(): OpenAI | null {
  if (openAiClient !== undefined) {
    return openAiClient;
  }

  const config = getOpenAiPlannerConfig();
  if (!config.enabled || !config.apiKey) {
    openAiClient = null;
    return openAiClient;
  }

  openAiClient = new OpenAI({
    apiKey: config.apiKey,
    ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
  });
  return openAiClient;
}

/**
 * Sets openai client for tests.
 */
export function setOpenAiClientForTests(client: OpenAI | null | undefined): void {
  openAiClient = client;
}
