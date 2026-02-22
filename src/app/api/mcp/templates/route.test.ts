
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

function createPostRequest(options?: {
  headers?: Record<string, string>;
  body?: unknown;
}) {
  return new NextRequest("http://localhost:3000/api/mcp/templates", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    body: JSON.stringify(options?.body ?? {}),
  });
}

describe("POST /api/mcp/templates", () => {
  const originalToken = process.env.MCP_INTERNAL_TOKEN;

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.MCP_INTERNAL_TOKEN;
    } else {
      process.env.MCP_INTERNAL_TOKEN = originalToken;
    }
    vi.restoreAllMocks();
  });

  it("returns 503 when MCP internal token is not configured", async () => {
    delete process.env.MCP_INTERNAL_TOKEN;

    const response = await POST(createPostRequest());
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(503);
    expect(payload.error).toContain("not configured");
  });

  it("returns 401 when internal token is configured but header is invalid", async () => {
    process.env.MCP_INTERNAL_TOKEN = "internal-secret";

    const response = await POST(
      createPostRequest({
        headers: {
          "x-mcp-internal-token": "wrong",
        },
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Unauthorized.");
  });
});
