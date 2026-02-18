import { describe, expect, it } from "vitest";

import {
  buildStubBoardCommandResponse,
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

