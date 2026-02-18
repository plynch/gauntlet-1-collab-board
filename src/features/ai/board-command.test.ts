import { describe, expect, it } from "vitest";

import {
  buildStubBoardCommandResponse,
  getBoardCommandErrorMessage,
  MAX_BOARD_COMMAND_SELECTION_IDS,
  parseBoardCommandRequest
} from "@/features/ai/board-command";

describe("parseBoardCommandRequest", () => {
  it("accepts valid payloads", () => {
    const parsed = parseBoardCommandRequest({
      boardId: " board-1 ",
      message: "  create a sticky note ",
      selectedObjectIds: ["a", " ", "b"]
    });

    expect(parsed).toEqual({
      boardId: "board-1",
      message: "create a sticky note",
      selectedObjectIds: ["a", "b"]
    });
  });

  it("rejects invalid payloads", () => {
    expect(parseBoardCommandRequest({})).toBeNull();
    expect(parseBoardCommandRequest({ boardId: "", message: "x" })).toBeNull();
    expect(parseBoardCommandRequest({ boardId: "x", message: "" })).toBeNull();
    expect(
      parseBoardCommandRequest({
        boardId: "x",
        message: "ok",
        selectedObjectIds: Array.from(
          { length: MAX_BOARD_COMMAND_SELECTION_IDS + 1 },
          (_, index) => `id-${index}`
        )
      })
    ).toBeNull();
  });
});

describe("buildStubBoardCommandResponse", () => {
  it("returns deterministic stub format", () => {
    const response = buildStubBoardCommandResponse({
      message: "Arrange items in a grid",
      canEdit: true
    });

    expect(response.ok).toBe(true);
    expect(response.provider).toBe("stub");
    expect(response.assistantMessage).toContain("AI agent coming soon!");
    expect(response.tools.length).toBeGreaterThan(0);
  });
});

describe("getBoardCommandErrorMessage", () => {
  it("maps timeout and HTTP status codes to user-facing fallback text", () => {
    expect(getBoardCommandErrorMessage({ status: null, timedOut: true })).toContain(
      "timed out"
    );
    expect(getBoardCommandErrorMessage({ status: 401 })).toContain("session expired");
    expect(getBoardCommandErrorMessage({ status: 403 })).toContain("do not have access");
    expect(getBoardCommandErrorMessage({ status: 404 })).toContain("could not be found");
    expect(getBoardCommandErrorMessage({ status: 500 })).toContain(
      "temporarily unavailable"
    );
    expect(getBoardCommandErrorMessage({ status: null })).toContain(
      "temporarily unavailable"
    );
  });
});
