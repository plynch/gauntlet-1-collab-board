import { NextResponse } from "next/server";

import {
  getOpenAiClient,
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";

/**
 * Returns whether e2e route enabled is true.
 */
function isE2eRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Returns whether openai readiness should validate live api is true.
 */
function shouldValidateOpenAiReadiness(): boolean {
  return process.env.OPENAI_READY_VALIDATE === "true";
}

/**
 * Gets openai error reason.
 */
function getOpenAiErrorReason(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim();
    return message && message.length > 0
      ? message
      : error.name || "OpenAI error without message";
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error.trim();
  }

  return "Unknown OpenAI readiness validation failure.";
}

/**
 * Handles get.
 */
export async function GET() {
  if (!isE2eRouteEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const config = getOpenAiPlannerConfig();
  const shouldValidate = shouldValidateOpenAiReadiness();
  let reason: string | null = null;
  let validated = false;
  if (config.plannerMode === "deterministic-only") {
    reason = "AI_PLANNER_MODE=deterministic-only disables OpenAI planner.";
  }
  if (!config.enabled && !reason) {
    const hasApiKey = Boolean(config.apiKey && config.apiKey.length > 0);
    if (!hasApiKey) {
      reason = "OPENAI_API_KEY is missing or empty server-side.";
    } else if (process.env.AI_ENABLE_OPENAI === "false") {
      reason = "AI_ENABLE_OPENAI=false disables OpenAI planner.";
    } else {
      reason = "OpenAI planner is disabled by configuration.";
    }
  } else if (shouldValidate) {
    const client = getOpenAiClient();
    if (!client) {
      reason = "OpenAI client could not be initialized server-side.";
    } else {
      try {
        await client.models.retrieve(config.model);
        validated = true;
      } catch (error) {
        reason = `OpenAI credential/model validation failed: ${getOpenAiErrorReason(error)}`;
      }
    }
  }

  const ready = config.enabled && (!shouldValidate || validated);
  return NextResponse.json({
    ready,
    configured: config.enabled,
    validated,
    hasAgentsTracingApiKey: Boolean(config.agentsTracingApiKey),
    validationMode: shouldValidate ? "live" : "config-only",
    model: config.model,
    plannerMode: config.plannerMode,
    runtime: config.runtime,
    agentsMaxTurns: config.agentsMaxTurns,
    agentsTracing: config.agentsTracing,
    agentsWorkflowName: config.agentsWorkflowName,
    baseUrl: config.baseUrl,
    reason,
  });
}
