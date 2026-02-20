import { NextResponse } from "next/server";

import { getLangfuseClient } from "@/features/ai/observability/langfuse-client";
import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";

/**
 * Handles get.
 */
export async function GET() {
  const openAiConfig = getOpenAiPlannerConfig();
  const langfuseClient = getLangfuseClient();
  const hasOpenAiKey = Boolean(openAiConfig.apiKey && openAiConfig.apiKey.length > 0);

  let openAiReason: string | null = null;
  if (!hasOpenAiKey) {
    openAiReason = "OPENAI_API_KEY is missing or empty server-side.";
  } else if (process.env.AI_ENABLE_OPENAI === "false") {
    openAiReason = "AI_ENABLE_OPENAI=false disables OpenAI planner.";
  } else if (openAiConfig.plannerMode === "deterministic-only") {
    openAiReason = "AI_PLANNER_MODE=deterministic-only disables OpenAI planner.";
  } else if (!openAiConfig.enabled) {
    openAiReason = "OpenAI planner is disabled by configuration.";
  }

  return NextResponse.json({
    langfuse: {
      ready: Boolean(langfuseClient),
      baseUrl: process.env.LANGFUSE_BASE_URL?.trim() || null,
      reason: langfuseClient
        ? null
        : "LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY are not configured server-side.",
    },
    openai: {
      ready: openAiConfig.enabled,
      model: openAiConfig.model,
      plannerMode: openAiConfig.plannerMode,
      runtime: openAiConfig.runtime,
      agentsTracing: openAiConfig.agentsTracing,
      agentsWorkflowName: openAiConfig.agentsWorkflowName,
      reason: openAiReason,
    },
  });
}
