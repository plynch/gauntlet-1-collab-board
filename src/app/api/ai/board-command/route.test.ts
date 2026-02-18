/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { MAX_BOARD_COMMAND_CHARS } from "@/features/ai/board-command";

import { POST } from "./route";

function createPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/board-command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

describe("POST /api/ai/board-command", () => {
  it("returns 400 for invalid command payload", async () => {
    const response = await POST(createPostRequest({ message: "hello" }));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid board command payload.");
  });

  it("returns 400 when message exceeds guardrail length", async () => {
    const response = await POST(
      createPostRequest({
        boardId: "board-1",
        message: "a".repeat(MAX_BOARD_COMMAND_CHARS + 1)
      })
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid board command payload.");
  });
});

