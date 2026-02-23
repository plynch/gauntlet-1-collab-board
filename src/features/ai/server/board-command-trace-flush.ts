import { withTimeout } from "@/features/ai/guardrails";
import { flushLangfuseClient } from "@/features/ai/observability/langfuse-client";
import { flushOpenAiTraces } from "@/features/ai/openai/agents/openai-agents-runner";

export async function flushAiTracesWithTimeout(timeoutMs: number): Promise<void> {
  const [langfuseFlushResult, openAiFlushResult] = await Promise.allSettled([
    withTimeout(
      flushLangfuseClient(),
      timeoutMs,
      "Langfuse trace flush timed out.",
    ),
    withTimeout(
      flushOpenAiTraces(),
      timeoutMs,
      "OpenAI trace flush timed out.",
    ),
  ]);
  if (langfuseFlushResult.status === "rejected") {
    console.warn("Failed to flush langfuse traces.", langfuseFlushResult.reason);
  }
  if (openAiFlushResult.status === "rejected") {
    console.warn("Failed to flush openai traces.", openAiFlushResult.reason);
  }
}
