import { isLangfuseConfigured } from "@/features/ai/observability/langfuse-client";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";

const DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS = 250;
const MAX_AI_TRACE_FLUSH_TIMEOUT_MS = 3_000;

export function isAiAuditEnabled(): boolean {
  return process.env.AI_AUDIT_LOG_ENABLED === "true";
}

export function getInternalMcpToken(): string | null {
  const value = process.env.MCP_INTERNAL_TOKEN?.trim();
  return value && value.length > 0 ? value : null;
}

export function getErrorReason(error: unknown): string {
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
  if (typeof candidate.name === "string" && candidate.name.trim().length > 0) {
    parts.push(`name=${candidate.name.trim()}`);
  }
  if (typeof candidate.code === "string" || typeof candidate.code === "number") {
    parts.push(`code=${String(candidate.code)}`);
  }
  if (
    typeof candidate.status === "string" ||
    typeof candidate.status === "number"
  ) {
    parts.push(`status=${String(candidate.status)}`);
  }
  if (parts.length > 0) {
    return parts.join(" ");
  }

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown structured error";
  }
}

export function getDebugMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }
  return getErrorReason(error);
}

export function createHttpError(
  status: number,
  message: string,
  debug?: string,
): Error & { status: number; debug?: string } {
  const error = new Error(message) as Error & { status: number; debug?: string };
  error.status = status;
  if (debug && debug.trim().length > 0) {
    error.debug = debug;
  }
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

export function getAiTraceFlushTimeoutMs(): number {
  const candidate = Number.parseInt(
    process.env.AI_TRACE_FLUSH_TIMEOUT_MS ?? "",
    10,
  );
  if (!Number.isFinite(candidate)) {
    return DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS;
  }
  return Math.max(
    DEFAULT_AI_TRACE_FLUSH_TIMEOUT_MS,
    Math.min(MAX_AI_TRACE_FLUSH_TIMEOUT_MS, candidate),
  );
}

export function isAiTracingRequired(): boolean {
  return parseRequiredFlag(
    process.env.AI_REQUIRE_TRACING,
    process.env.NODE_ENV === "production",
  );
}

export function isOpenAiTracingRequired(): boolean {
  return parseRequiredFlag(
    process.env.AI_REQUIRE_OPENAI_TRACING,
    isAiTracingRequired(),
  );
}

export function getAiTracingConfigurationError(): string | null {
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
