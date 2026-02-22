import { describe, expect, it, vi } from "vitest";
import type { FunctionTool } from "@openai/agents";

import { createBoardAgentTools } from "@/features/ai/openai/agents/board-agent-tools";
import type { BoardToolCall } from "@/features/ai/types";

function createTraceStub() {
  return {
    traceId: "trace-test-1",
    startSpan: vi.fn(() => ({
      end: vi.fn(),
      fail: vi.fn(),
    })),
  };
}

describe("createBoardAgentTools", () => {
  it("tracks created object IDs for create tools", async () => {
    const executeToolCall = vi
      .fn()
      .mockResolvedValue({
        tool: "createStickyBatch",
        objectId: "sticky-1",
        createdObjectIds: ["sticky-1", "sticky-2"],
      });
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds: [],
      viewportBounds: null,
    });

    const toolCall: BoardToolCall = {
      tool: "createStickyBatch",
      args: {
        count: 2,
        color: "#fde68a",
        originX: 120,
        originY: 160,
      },
    };
    await session.executeToolCallForTests(toolCall);

    const snapshot = session.getExecutionSnapshot();
    expect(snapshot.operationsExecuted).toHaveLength(1);
    expect(snapshot.createdObjectIds).toEqual(["sticky-1", "sticky-2"]);
    expect(snapshot.toolCalls).toBe(1);
  });

  it("rejects oversized layout calls before write", async () => {
    const executeToolCall = vi.fn();
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds: [],
      viewportBounds: null,
    });

    const toolCall: BoardToolCall = {
      tool: "arrangeObjectsInGrid",
      args: {
        objectIds: Array.from({ length: 51 }, (_, index) => `obj-${index}`),
        columns: 3,
      },
    };

    await expect(session.executeToolCallForTests(toolCall)).rejects.toThrow(
      /arrangeObjectsInGrid exceeds max object ids/i,
    );
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(session.getExecutionSnapshot().operationsExecuted).toHaveLength(0);
  });

  it("applies selected object defaults when alignObjects omits ids", async () => {
    const executeToolCall = vi.fn().mockResolvedValue({ tool: "alignObjects" });
    const selectedObjectIds = ["obj-1", "obj-2"];
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds,
      viewportBounds: null,
    });

    const alignTool = session.tools.find(
      (toolItem): toolItem is FunctionTool =>
        toolItem.type === "function" && toolItem.name === "alignObjects",
    );
    if (!alignTool) {
      throw new Error("alignObjects tool missing.");
    }

    await alignTool.invoke(
      {} as never,
      JSON.stringify({ objectIds: null, alignment: "left" }),
    );

    expect(executeToolCall).toHaveBeenCalledWith({
      tool: "alignObjects",
      args: {
        objectIds: selectedObjectIds,
        alignment: "left",
      },
    });
  });

  it("uses explicit coordinate hints for createShape placement", async () => {
    const executeToolCall = vi.fn().mockResolvedValue({
      tool: "createShape",
      objectId: "shape-1",
    });
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds: [],
      viewportBounds: null,
      coordinateHints: {
        hintedX: 100,
        hintedY: 200,
      },
    });

    const createShapeTool = session.tools.find(
      (toolItem): toolItem is FunctionTool =>
        toolItem.type === "function" && toolItem.name === "createShape",
    );
    if (!createShapeTool) {
      throw new Error("createShape tool missing.");
    }

    await createShapeTool.invoke(
      {} as never,
      JSON.stringify({
        type: "rect",
        x: null,
        y: null,
        width: null,
        height: null,
        color: "#93c5fd",
      }),
    );

    expect(executeToolCall).toHaveBeenCalledWith({
      tool: "createShape",
      args: {
        type: "rect",
        x: 100,
        y: 200,
        width: 220,
        height: 160,
        color: "#93c5fd",
      },
    });
  });

  it("uses viewport-fit sticky batch defaults without overlap", async () => {
    const executeToolCall = vi.fn().mockResolvedValue({
      tool: "createStickyBatch",
      createdObjectIds: [],
    });
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1_200,
        height: 800,
      },
      messageIntentHints: {
        stickyCreateRequest: true,
        stickyColorHint: null,
        createRequest: true,
        requestedCreateCount: 30,
        stickyRequestedCount: 30,
        shapeRequestedCount: null,
        createLimitExceeded: false,
        stickyLayoutHints: {
          rowRequested: false,
          stackRequested: false,
        },
        viewportLayoutRequested: false,
      },
    });

    const createStickyBatchTool = session.tools.find(
      (toolItem): toolItem is FunctionTool =>
        toolItem.type === "function" && toolItem.name === "createStickyBatch",
    );
    if (!createStickyBatchTool) {
      throw new Error("createStickyBatch tool missing.");
    }

    await createStickyBatchTool.invoke(
      {} as never,
      JSON.stringify({
        count: 30,
        color: null,
        originX: null,
        originY: null,
        columns: null,
        gapX: null,
        gapY: null,
        textPrefix: null,
      }),
    );

    expect(executeToolCall).toHaveBeenCalledWith({
      tool: "createStickyBatch",
      args: expect.objectContaining({
        count: 30,
        originX: 40,
        originY: 40,
        columns: 6,
        gapX: 204,
        gapY: 164,
      }),
    });
  });

  it("applies explicit sticky layout hints over auto-layout defaults", async () => {
    const executeToolCall = vi.fn().mockResolvedValue({
      tool: "createStickyBatch",
      createdObjectIds: [],
    });
    const session = createBoardAgentTools({
      executor: {
        executeToolCall,
        getBoardState: vi.fn().mockResolvedValue([]),
      } as never,
      trace: createTraceStub() as never,
      selectedObjectIds: [],
      viewportBounds: {
        left: 100,
        top: 80,
        width: 1_000,
        height: 700,
      },
      messageIntentHints: {
        stickyCreateRequest: true,
        stickyColorHint: "#f9a8d4",
        createRequest: true,
        requestedCreateCount: 20,
        stickyRequestedCount: 20,
        shapeRequestedCount: null,
        createLimitExceeded: false,
        stickyLayoutHints: {
          columns: 4,
          gapX: 24,
          gapY: 32,
          rowRequested: false,
          stackRequested: false,
        },
        viewportLayoutRequested: false,
      },
    });

    const createStickyBatchTool = session.tools.find(
      (toolItem): toolItem is FunctionTool =>
        toolItem.type === "function" && toolItem.name === "createStickyBatch",
    );
    if (!createStickyBatchTool) {
      throw new Error("createStickyBatch tool missing.");
    }

    await createStickyBatchTool.invoke(
      {} as never,
      JSON.stringify({
        count: 20,
        color: "#fde68a",
        originX: null,
        originY: null,
        columns: null,
        gapX: null,
        gapY: null,
        textPrefix: null,
      }),
    );

    expect(executeToolCall).toHaveBeenCalledWith({
      tool: "createStickyBatch",
      args: expect.objectContaining({
        columns: 4,
        gapX: 204,
        gapY: 172,
      }),
    });
  });
});
