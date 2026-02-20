/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  MAX_BOARD_COMMAND_CHARS,
  MAX_BOARD_COMMAND_SELECTION_IDS,
} from "@/features/ai/board-command";
import { getOpenAiRequiredErrorResponse } from "@/features/ai/openai/openai-required-response";
import { POST } from "./route";

/**
 * Creates post request.
 */
function createPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/board-command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Creates raw post request.
 */
function createRawPostRequest(body: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/board-command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
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
        message: "a".repeat(MAX_BOARD_COMMAND_CHARS + 1),
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid board command payload.");
  });

  it("returns 400 for invalid JSON body", async () => {
    const response = await POST(createRawPostRequest("{"));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON body.");
  });

  it("returns 400 when selected object ids exceed limit", async () => {
    const response = await POST(
      createPostRequest({
        boardId: "board-1",
        message: "do something",
        selectedObjectIds: Array.from(
          { length: MAX_BOARD_COMMAND_SELECTION_IDS + 1 },
          (_, index) => `object-${index}`,
        ),
      }),
    );
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid board command payload.");
  });

  it("maps strict-mode openai planned=false to 422", () => {
    const failure = getOpenAiRequiredErrorResponse({
      status: "not-planned",
      model: "gpt-4.1-nano",
      intent: "unsupported-command",
      assistantMessage: "I could not map that command.",
      totalSpentUsd: 0.003,
      usage: {
        model: "gpt-4.1-nano",
        inputTokens: 120,
        outputTokens: 42,
        totalTokens: 162,
        estimatedCostUsd: 0.0001,
      },
    });

    expect(failure.status).toBe(422);
    expect(failure.message).toContain("OpenAI-required mode");
  });

  it("maps strict-mode disabled planner to 503", () => {
    const failure = getOpenAiRequiredErrorResponse({
      status: "disabled",
      model: "gpt-4.1-nano",
      reason: "Skipped because AI_PLANNER_MODE=deterministic-only.",
    });

    expect(failure.status).toBe(503);
    expect(failure.message).toContain("OpenAI-required mode is enabled");
  });
});
