import { NextResponse } from "next/server";

import { getOpenAiPlannerConfig } from "@/features/ai/openai/openai-client";

/**
 * Returns whether e2e route enabled is true.
 */
function isE2eRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.ENABLE_E2E_LAB === "1"
  );
}

/**
 * Handles get.
 */
export async function GET() {
  if (!isE2eRouteEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const config = getOpenAiPlannerConfig();
  let reason: string | null = null;
  if (!config.enabled) {
    const hasApiKey = Boolean(config.apiKey && config.apiKey.length > 0);
    if (!hasApiKey) {
      reason = "OPENAI_API_KEY is missing or empty server-side.";
    } else if (process.env.AI_ENABLE_OPENAI === "false") {
      reason = "AI_ENABLE_OPENAI=false disables OpenAI planner.";
    } else {
      reason = "OpenAI planner is disabled by configuration.";
    }
  }
  return NextResponse.json({
    ready: config.enabled,
    model: config.model,
    baseUrl: config.baseUrl,
    reason,
  });
}
