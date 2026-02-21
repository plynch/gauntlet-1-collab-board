import { NextResponse } from "next/server";

import {
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import { isLangfuseConfigured } from "@/features/ai/observability/langfuse-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parses required flag.
 */
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

/**
 * Handles get.
 */
export async function GET() {
  const requireTracing = parseRequiredFlag(
    process.env.AI_REQUIRE_TRACING,
    process.env.NODE_ENV === "production",
  );
  const requireOpenAiTracing = parseRequiredFlag(
    process.env.AI_REQUIRE_OPENAI_TRACING,
    requireTracing,
  );
  const openAiConfig = getOpenAiPlannerConfig();
  const langfuseConfigured = isLangfuseConfigured();

  const reasons: string[] = [];
  if (requireTracing && !langfuseConfigured) {
    reasons.push(
      "LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY missing while AI tracing is required.",
    );
  }
  if (
    requireOpenAiTracing &&
    openAiConfig.enabled &&
    openAiConfig.runtime === "agents-sdk" &&
    !openAiConfig.agentsTracing
  ) {
    reasons.push(
      "OPENAI_AGENTS_TRACING must be true when OpenAI tracing is required.",
    );
  }

  const ready = reasons.length === 0;

  return NextResponse.json({
    ready,
    requireTracing,
    requireOpenAiTracing,
    langfuseConfigured,
    openAi: {
      enabled: openAiConfig.enabled,
      plannerMode: openAiConfig.plannerMode,
      runtime: openAiConfig.runtime,
      model: openAiConfig.model,
      agentsTracing: openAiConfig.agentsTracing,
      hasAgentsTracingApiKey: Boolean(openAiConfig.agentsTracingApiKey),
      hasApiKey: Boolean(openAiConfig.apiKey),
    },
    reasons,
  });
}
