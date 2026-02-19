import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";

import type { AiTraceRun } from "@/features/ai/observability/trace-run";

type TraceSpanHandle = ReturnType<AiTraceRun["startSpan"]>;

type RunSpan = {
  span: TraceSpanHandle;
  type: "chain" | "tool";
};

/**
 * Handles parse serialized name.
 */
function parseSerializedName(
  serialized: Serialized,
  fallback: string,
): string {
  const candidate = serialized as unknown as {
    id?: unknown;
    name?: unknown;
  };
  if (typeof candidate.name === "string" && candidate.name.trim().length > 0) {
    return candidate.name.trim();
  }

  if (Array.isArray(candidate.id)) {
    const values = candidate.id.filter(
      (value): value is string =>
        typeof value === "string" && value.trim().length > 0,
    );
    if (values.length > 0) {
      return values.join(".");
    }
  }

  return fallback;
}

/**
 * Handles to safe json.
 */
function toSafeJson(input: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    return input;
  }
}

/**
 * Gets error message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return "Unknown LangChain execution error.";
}

/**
 * LangChain callback bridge that emits chain/tool runs into Langfuse spans.
 */
export class LangChainLangfuseCallbackHandler extends BaseCallbackHandler {
  name = "langchain-langfuse-callback-handler";
  ignoreLLM = true;
  ignoreRetriever = true;
  ignoreAgent = false;
  ignoreCustomEvent = true;

  private readonly spansByRunId = new Map<string, RunSpan>();

  /**
   * Initializes this class instance.
   */
  constructor(private readonly trace: AiTraceRun) {
    super();
  }

  /**
   * Handles start chain.
   */
  handleChainStart(
    chain: Serialized,
    inputs: Record<string, unknown>,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runType?: string,
    runName?: string,
  ): void {
    const span = this.trace.startSpan("tool.execute", {
      langchain: true,
      runId,
      parentRunId: parentRunId ?? null,
      runType: runType ?? "chain",
      runName: runName ?? parseSerializedName(chain, "tool.execute"),
      tags: tags ?? [],
      metadata: metadata ?? {},
      inputs,
    });
    this.spansByRunId.set(runId, {
      span,
      type: "chain",
    });
  }

  /**
   * Handles end chain.
   */
  handleChainEnd(outputs: Record<string, unknown>, runId: string): void {
    const runSpan = this.spansByRunId.get(runId);
    if (!runSpan || runSpan.type !== "chain") {
      return;
    }
    runSpan.span.end({
      langchain: true,
      outputs,
    });
    this.spansByRunId.delete(runId);
  }

  /**
   * Handles chain error.
   */
  handleChainError(error: unknown, runId: string): void {
    const runSpan = this.spansByRunId.get(runId);
    if (!runSpan || runSpan.type !== "chain") {
      return;
    }
    runSpan.span.fail(getErrorMessage(error), {
      langchain: true,
      runId,
    });
    this.spansByRunId.delete(runId);
  }

  /**
   * Handles start tool.
   */
  handleToolStart(
    tool: Serialized,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string,
  ): void {
    const span = this.trace.startSpan("tool.execute.call", {
      langchain: true,
      runId,
      parentRunId: parentRunId ?? null,
      tool: runName ?? parseSerializedName(tool, "tool"),
      tags: tags ?? [],
      metadata: metadata ?? {},
      input: toSafeJson(input),
    });
    this.spansByRunId.set(runId, {
      span,
      type: "tool",
    });
  }

  /**
   * Handles end tool.
   */
  handleToolEnd(output: unknown, runId: string): void {
    const runSpan = this.spansByRunId.get(runId);
    if (!runSpan || runSpan.type !== "tool") {
      return;
    }
    runSpan.span.end({
      langchain: true,
      output,
    });
    this.spansByRunId.delete(runId);
  }

  /**
   * Handles tool error.
   */
  handleToolError(error: unknown, runId: string): void {
    const runSpan = this.spansByRunId.get(runId);
    if (!runSpan || runSpan.type !== "tool") {
      return;
    }
    runSpan.span.fail(getErrorMessage(error), {
      langchain: true,
      runId,
    });
    this.spansByRunId.delete(runId);
  }
}
