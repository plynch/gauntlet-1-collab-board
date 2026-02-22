import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

import {
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import {
  flushLangfuseClient,
  getLangfuseClient,
  isLangfuseConfigured,
} from "@/features/ai/observability/langfuse-client";
import { AuthError, requireUser } from "@/server/auth/require-user";

const TRACE_READY_SCHEMA_VERSION = "2026-02-24-a";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  try {
    await requireUser(request);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Authentication failed." },
      { status: 401 },
    );
  }

  const searchParams = new URL(request.url).searchParams;
  const runProbe = searchParams.get("probe") === "1";
  const langfuseBaseUrl = process.env.LANGFUSE_BASE_URL?.trim() || null;
  const langfuseEnvironment =
    process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim() || "default";
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
    reasons.push("Langfuse tracing is not fully configured.");
  }
  if (requireTracing && !langfuseBaseUrl) {
    reasons.push("Langfuse base URL is missing.");
  }
  if (
    requireOpenAiTracing &&
    openAiConfig.enabled &&
    openAiConfig.runtime === "agents-sdk" &&
    !openAiConfig.agentsTracing
  ) {
    reasons.push("OpenAI tracing is disabled while required.");
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
              void error;
              reasons.push("Langfuse trace readback failed.");
            }
          }
        } catch (error) {
          langfuseValidated = false;
          void error;
          langfuseValidationError = "Langfuse probe trace failed.";
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
    langfuse: {
      configured: langfuseConfigured,
      validated: langfuseValidated,
      environment: langfuseEnvironment,
      ...(langfuseValidationError ? { validationError: langfuseValidationError } : {}),
    },
    openAi: {
      enabled: openAiConfig.enabled,
      tracingEnabled: openAiConfig.agentsTracing,
    },
    reasons,
  });
}
