import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import {
  flushLangfuseClient,
  getLangfuseClient,
  getLangfusePublicKeyPreview,
  isLangfuseConfigured,
} from "@/features/ai/observability/langfuse-client";

const TRACE_READY_SCHEMA_VERSION = "2026-02-24-a";

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
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const runProbe = searchParams.get("probe") === "1";
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL?.trim() || null;
  const langfuseEnvironment =
    process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || "default";
  const langfusePublicKeyPreview = getLangfusePublicKeyPreview();
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
  let langfuseValidated = false;
  let langfuseValidationError: string | null = null;
  let probeTraceId: string | null = null;

  const reasons: string[] = [];
  if (requireTracing && !langfuseConfigured) {
    reasons.push(
      "LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY missing while AI tracing is required.",
    );
  }
  if (requireTracing && !langfuseBaseUrl) {
    reasons.push(
      "LANGFUSE_BASE_URL missing while AI tracing is required (set https://us.cloud.langfuse.com for US project).",
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

  if (langfuseConfigured) {
    const langfuseClient = getLangfuseClient();
    const publicApi = (langfuseClient as unknown as {
      api?: {
        traceGet?: (traceId: string) => Promise<unknown>;
      };
    } | null)?.api;

    if (!langfuseClient) {
      langfuseValidationError = "Langfuse client initialization failed.";
      reasons.push(langfuseValidationError);
    } else {
      langfuseValidated = true;
      if (runProbe) {
        probeTraceId = `probe-${randomUUID()}`;
        try {
          langfuseClient.trace({
            id: probeTraceId,
            name: "ai-tracing-ready-probe",
            input: {
              probe: true,
              source: "api/ai/tracing-ready",
            },
            metadata: {
              source: "api/ai/tracing-ready",
            },
          });
          await flushLangfuseClient();

          if (publicApi?.traceGet) {
            try {
              await publicApi.traceGet(probeTraceId);
            } catch (error) {
              reasons.push(
                error instanceof Error && error.message.trim().length > 0
                  ? `Langfuse trace readback failed: ${error.message}`
                  : "Langfuse trace readback failed.",
              );
            }
          }
        } catch (error) {
          langfuseValidated = false;
          langfuseValidationError =
            error instanceof Error && error.message.trim().length > 0
              ? `Langfuse probe trace failed: ${error.message}`
              : "Langfuse probe trace failed.";
          reasons.push(langfuseValidationError);
        }
      }
    }
  }

  const ready = reasons.length === 0;

  return NextResponse.json({
    schemaVersion: TRACE_READY_SCHEMA_VERSION,
    ready,
    requireTracing,
    requireOpenAiTracing,
    langfuseConfigured,
    langfuseBaseUrl,
    langfuseEnvironment,
    langfusePublicKeyPreview,
    langfuseValidated,
    ...(langfuseValidationError ? { langfuseValidationError } : {}),
    ...(probeTraceId ? { probeTraceId } : {}),
    source: "api/ai/tracing-ready",
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
