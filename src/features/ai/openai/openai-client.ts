import OpenAI from "openai";

export type AiPlannerMode =
  | "openai-strict"
  | "openai-with-fallback"
  | "deterministic-only";
export type OpenAiRuntime = "agents-sdk" | "chat-completions";

type OpenAiPlannerConfig = {
  enabled: boolean;
  apiKey: string | null;
  baseUrl: string | null;
  model: string;
  plannerMode: AiPlannerMode;
  runtime: OpenAiRuntime;
  maxOutputTokens: number;
  reserveUsdPerCall: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
  maxContextObjects: number;
  agentsMaxTurns: number;
  agentsTracing: boolean;
  agentsTracingApiKey: string | null;
  agentsWorkflowName: string;
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
 * Parses planner mode env.
 */
function parsePlannerModeEnv(value: string | undefined): AiPlannerMode {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "openai-strict") {
    return "openai-strict";
  }
  if (normalized === "deterministic-only") {
    return "deterministic-only";
  }
  return "openai-with-fallback";
}

/**
 * Parses openai runtime env.
 */
function parseOpenAiRuntimeEnv(value: string | undefined): OpenAiRuntime {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "chat-completions") {
    return "chat-completions";
  }
  return "agents-sdk";
}

/**
 * Parses boolean env.
 */
function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (
    normalized === "false" ||
    normalized === "0" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }
  return fallback;
}

/**
 * Gets openai planner config.
 */
export function getOpenAiPlannerConfig(): OpenAiPlannerConfig {
  const apiKey = process.env.OPENAI_API_KEY?.trim() || null;
  const baseUrl = process.env.OPENAI_BASE_URL?.trim() || null;
  const model = process.env.OPENAI_MODEL?.trim() || "gpt-4.1-nano";
  const agentsTracingApiKey =
    process.env.OPENAI_AGENTS_TRACING_API_KEY?.trim() ||
    process.env.OPENAI_TRACING_API_KEY?.trim() ||
    apiKey ||
    null;
  const plannerMode = parsePlannerModeEnv(process.env.AI_PLANNER_MODE);
  const runtime = parseOpenAiRuntimeEnv(process.env.OPENAI_RUNTIME);
  const enabled =
    plannerMode !== "deterministic-only" &&
    process.env.AI_ENABLE_OPENAI !== "false" &&
    Boolean(apiKey && model);

  return {
    enabled,
    apiKey,
    baseUrl,
    model,
    plannerMode,
    runtime,
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
    agentsMaxTurns: parsePositiveIntegerEnv(
      process.env.OPENAI_AGENTS_MAX_TURNS,
      8,
    ),
    agentsTracing: parseBooleanEnv(process.env.OPENAI_AGENTS_TRACING, true),
    agentsTracingApiKey,
    agentsWorkflowName:
      process.env.OPENAI_AGENTS_WORKFLOW_NAME?.trim() || "collabboard-command",
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
