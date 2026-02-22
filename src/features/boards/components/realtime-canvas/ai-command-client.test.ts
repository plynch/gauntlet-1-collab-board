import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { sendBoardAiCommand } from "@/features/boards/components/realtime-canvas/ai-command-client";

describe("sendBoardAiCommand", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns assistant payload for successful responses", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        assistantMessage: "Created sticky note.",
        selectionUpdate: {
          mode: "replace",
          objectIds: ["obj-1"],
        },
      }),
    } as Response);

    const result = await sendBoardAiCommand({
      boardId: "board-1",
      message: "create sticky",
      idToken: "token",
      selectedObjectIds: [],
    });

    expect(result).toEqual({
      assistantMessage: "Created sticky note.",
      selectionUpdate: {
        mode: "replace",
        objectIds: ["obj-1"],
      },
    });
  });

  it("returns normalized fallback for failed responses and network errors", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: "custom error",
        }),
      } as Response)
      .mockRejectedValueOnce(new Error("offline"));

    const failedResult = await sendBoardAiCommand({
      boardId: "board-1",
      message: "create sticky",
      idToken: "token",
      selectedObjectIds: [],
    });
    expect(failedResult.assistantMessage).toBe("custom error");

    const networkResult = await sendBoardAiCommand({
      boardId: "board-1",
      message: "create sticky",
      idToken: "token",
      selectedObjectIds: [],
    });
    expect(networkResult.assistantMessage).toBe(
      "AI backend is temporarily unavailable. Please try again shortly.",
    );
  });
});
