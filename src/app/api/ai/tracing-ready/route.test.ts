/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const getOpenAiPlannerConfigMock = vi.fn();
const flushLangfuseClientMock = vi.fn();
const getLangfuseClientMock = vi.fn();
const isLangfuseConfiguredMock = vi.fn();

vi.mock("@/server/auth/require-user", () => {
  class AuthError extends Error {
    readonly status: number;

    /**
     * Initializes this class instance.
     */
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
      this.name = "AuthError";
    }
  }

  return {
    AuthError,
    requireUser: requireUserMock,
  };
});

vi.mock("@/features/ai/openai/openai-client", () => ({
  getOpenAiPlannerConfig: getOpenAiPlannerConfigMock,
}));

vi.mock("@/features/ai/observability/langfuse-client", () => ({
  flushLangfuseClient: flushLangfuseClientMock,
  getLangfuseClient: getLangfuseClientMock,
  isLangfuseConfigured: isLangfuseConfiguredMock,
}));

const originalAiRequireTracing = process.env.AI_REQUIRE_TRACING;
const originalAiRequireOpenAiTracing = process.env.AI_REQUIRE_OPENAI_TRACING;
const originalLangfuseBaseUrl = process.env.LANGFUSE_BASE_URL;
const originalLangfuseEnvironment = process.env.LANGFUSE_TRACING_ENVIRONMENT;

afterEach(() => {
  if (originalAiRequireTracing === undefined) {
    delete process.env.AI_REQUIRE_TRACING;
  } else {
    process.env.AI_REQUIRE_TRACING = originalAiRequireTracing;
  }

  if (originalAiRequireOpenAiTracing === undefined) {
    delete process.env.AI_REQUIRE_OPENAI_TRACING;
  } else {
    process.env.AI_REQUIRE_OPENAI_TRACING = originalAiRequireOpenAiTracing;
  }

  if (originalLangfuseBaseUrl === undefined) {
    delete process.env.LANGFUSE_BASE_URL;
  } else {
    process.env.LANGFUSE_BASE_URL = originalLangfuseBaseUrl;
  }

  if (originalLangfuseEnvironment === undefined) {
    delete process.env.LANGFUSE_TRACING_ENVIRONMENT;
  } else {
    process.env.LANGFUSE_TRACING_ENVIRONMENT = originalLangfuseEnvironment;
  }

  requireUserMock.mockReset();
  getOpenAiPlannerConfigMock.mockReset();
  flushLangfuseClientMock.mockReset();
  getLangfuseClientMock.mockReset();
  isLangfuseConfiguredMock.mockReset();
});

describe("GET /api/ai/tracing-ready", () => {
  it("returns 401 when auth fails", async () => {
    const authModule = await import("@/server/auth/require-user");
    requireUserMock.mockRejectedValue(new authModule.AuthError("Missing Authorization header.", 401));

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/ai/tracing-ready");
    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it("returns redacted readiness payload when authenticated", async () => {
    process.env.AI_REQUIRE_TRACING = "true";
    process.env.AI_REQUIRE_OPENAI_TRACING = "true";
    process.env.LANGFUSE_BASE_URL = "https://us.cloud.langfuse.com";
    process.env.LANGFUSE_TRACING_ENVIRONMENT = "default";

    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getOpenAiPlannerConfigMock.mockReturnValue({
      enabled: true,
      runtime: "agents-sdk",
      model: "gpt-4.1-nano",
      agentsTracing: true,
      plannerMode: "openai-strict",
      agentsTracingApiKey: "trace-key",
      apiKey: "openai-key",
    });
    isLangfuseConfiguredMock.mockReturnValue(true);
    getLangfuseClientMock.mockReturnValue({
      trace: vi.fn(),
      api: { traceGet: vi.fn().mockResolvedValue({ id: "trace-1" }) },
    });
    flushLangfuseClientMock.mockResolvedValue(undefined);

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/ai/tracing-ready");
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload.ready).toBe(true);
    expect(payload.langfuse).toEqual({
      configured: true,
      validated: true,
      environment: "default",
    });
    expect(payload.openAi).toEqual({
      enabled: true,
      tracingEnabled: true,
    });

    expect(payload).not.toHaveProperty("langfuseBaseUrl");
    expect(payload).not.toHaveProperty("langfusePublicKeyPreview");
    expect(payload).not.toHaveProperty("source");
    expect(payload).not.toHaveProperty("probeTraceId");
  });
});
