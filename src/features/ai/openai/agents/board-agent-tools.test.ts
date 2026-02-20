import { describe, expect, it, vi } from "vitest";
import type { FunctionTool } from "@openai/agents";

import { createBoardAgentTools } from "@/features/ai/openai/agents/board-agent-tools";
import type { BoardToolCall } from "@/features/ai/types";

/**
 * Creates trace stub.
 */
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

    await alignTool.invoke({} as never, JSON.stringify({ alignment: "left" }));

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
      JSON.stringify({ type: "rect", color: "#93c5fd" }),
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
});
