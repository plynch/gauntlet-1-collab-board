import { describe, expect, it } from "vitest";

import {
  buildClearBoardAssistantMessage,
  buildDeterministicBoardCommandResponse,
  buildStubBoardCommandResponse,
  buildSwotAssistantMessage,
  detectBoardCommandIntent,
  getBoardCommandErrorMessage,
  MAX_BOARD_COMMAND_SELECTION_IDS,
  parseBoardCommandRequest,
} from "@/features/ai/board-command";

describe("parseBoardCommandRequest", () => {
  it("accepts valid payloads", () => {
    const parsed = parseBoardCommandRequest({
      boardId: " board-1 ",
      message: "  create a sticky note ",
      selectedObjectIds: ["a", " ", "b"],
    });

    expect(parsed).toEqual({
      boardId: "board-1",
      message: "create a sticky note",
      selectedObjectIds: ["a", "b"],
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
          (_, index) => `id-${index}`,
        ),
      }),
    ).toBeNull();
  });
});

describe("buildStubBoardCommandResponse", () => {
  it("returns deterministic stub format", () => {
    const response = buildStubBoardCommandResponse({
      message: "Arrange items in a grid",
      canEdit: true,
    });

    expect(response.ok).toBe(true);
    expect(response.provider).toBe("stub");
    expect(response.assistantMessage).toContain("AI agent coming soon!");
    expect(response.tools.length).toBeGreaterThan(0);
    expect(response.mode).toBe("stub");
    expect(response.execution?.intent).toBe("stub");
  });
});

describe("detectBoardCommandIntent", () => {
  it("maps SWOT requests to deterministic template intent", () => {
    expect(detectBoardCommandIntent("Create a SWOT analysis template")).toBe(
      "swot-template",
    );
    expect(detectBoardCommandIntent("build swot board")).toBe("swot-template");
    expect(detectBoardCommandIntent("hello there")).toBe("stub");
  });
});

describe("buildSwotAssistantMessage", () => {
  it("returns explicit fallback status in assistant response text", () => {
    const direct = buildSwotAssistantMessage({
      fallbackUsed: false,
      objectsCreated: 8,
    });
    const fallback = buildSwotAssistantMessage({
      fallbackUsed: true,
      objectsCreated: 8,
    });

    expect(direct).toContain("8 objects");
    expect(fallback).toContain("fallback mode");
  });
});

describe("buildClearBoardAssistantMessage", () => {
  it("returns success text when all objects were deleted", () => {
    expect(
      buildClearBoardAssistantMessage({
        deletedCount: 5,
        remainingCount: 0,
      }),
    ).toContain("Cleared board and deleted 5 objects");
  });

  it("returns partial-clear text when objects remain", () => {
    expect(
      buildClearBoardAssistantMessage({
        deletedCount: 3,
        remainingCount: 2,
      }),
    ).toContain("but 2 objects still remain");
  });
});

describe("buildDeterministicBoardCommandResponse", () => {
  it("returns response metadata for deterministic execution", () => {
    const response = buildDeterministicBoardCommandResponse({
      assistantMessage: "Created SWOT",
      traceId: "trace-1",
      execution: {
        intent: "swot-template",
        mode: "deterministic",
        mcpUsed: true,
        fallbackUsed: false,
        toolCalls: 8,
        objectsCreated: 8,
      },
    });

    expect(response.ok).toBe(true);
    expect(response.provider).toBe("deterministic-mcp");
    expect(response.mode).toBe("deterministic");
    expect(response.traceId).toBe("trace-1");
  });
});

describe("getBoardCommandErrorMessage", () => {
  it("maps timeout and HTTP status codes to user-facing fallback text", () => {
    expect(
      getBoardCommandErrorMessage({ status: null, timedOut: true }),
    ).toContain("timed out");
    expect(getBoardCommandErrorMessage({ status: 401 })).toContain(
      "session expired",
    );
    expect(getBoardCommandErrorMessage({ status: 403 })).toContain(
      "do not have access",
    );
    expect(getBoardCommandErrorMessage({ status: 404 })).toContain(
      "could not be found",
    );
    expect(getBoardCommandErrorMessage({ status: 500 })).toContain(
      "temporarily unavailable",
    );
    expect(getBoardCommandErrorMessage({ status: null })).toContain(
      "temporarily unavailable",
    );
  });
});
