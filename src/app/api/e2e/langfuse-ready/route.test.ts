/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const getLangfuseClientMock = vi.fn();

vi.mock("@/features/ai/observability/langfuse-client", () => ({
  getLangfuseClient: getLangfuseClientMock,
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalLangfuseBaseUrl = process.env.LANGFUSE_BASE_URL;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalLangfuseBaseUrl === undefined) {
    delete process.env.LANGFUSE_BASE_URL;
  } else {
    process.env.LANGFUSE_BASE_URL = originalLangfuseBaseUrl;
  }

  getLangfuseClientMock.mockReset();
});

describe("GET /api/e2e/langfuse-ready", () => {
  it("returns readiness payload outside production", async () => {
    process.env.NODE_ENV = "test";
    process.env.LANGFUSE_BASE_URL = "https://us.cloud.langfuse.com";
    getLangfuseClientMock.mockReturnValue({ trace: vi.fn() });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ready?: unknown;
      baseUrl?: unknown;
    };
    expect(payload.ready).toBe(true);
    expect(payload.baseUrl).toBe("https://us.cloud.langfuse.com");
  });

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production";
    getLangfuseClientMock.mockReturnValue({ trace: vi.fn() });

    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(404);
  });
});
