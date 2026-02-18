import { describe, expect, it } from "vitest";

import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import type { BoardObjectSnapshot } from "@/features/ai/types";

const BOARD_STATE: BoardObjectSnapshot[] = [
  {
    id: "obj-1",
    type: "rect",
    zIndex: 1,
    x: 100,
    y: 120,
    width: 240,
    height: 150,
    rotationDeg: 0,
    color: "#93c5fd",
    text: "",
    updatedAt: null
  },
  {
    id: "obj-2",
    type: "sticky",
    zIndex: 2,
    x: 420,
    y: 120,
    width: 220,
    height: 170,
    rotationDeg: 0,
    color: "#fde68a",
    text: "Old",
    updatedAt: null
  }
];

describe("planDeterministicCommand", () => {
  it("plans clear board commands", () => {
    const result = planDeterministicCommand({
      message: "clear the board",
      boardState: BOARD_STATE,
      selectedObjectIds: []
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("clear-board");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("deleteObjects");
    }
  });

  it("returns a no-op clear-board message when already empty", () => {
    const result = planDeterministicCommand({
      message: "remove all shapes",
      boardState: [],
      selectedObjectIds: []
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("clear-board-empty");
  });

  it("treats delete all shapes as clear-board command", () => {
    const result = planDeterministicCommand({
      message: "delete all shapes",
      boardState: BOARD_STATE,
      selectedObjectIds: []
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("clear-board");
      expect(result.plan.operations[0]?.tool).toBe("deleteObjects");
    }
  });

  it("plans delete selected command", () => {
    const result = planDeterministicCommand({
      message: "delete selected",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"]
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("delete-selected");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("deleteObjects");
      if (result.plan.operations[0]?.tool === "deleteObjects") {
        expect(result.plan.operations[0].args.objectIds).toEqual(["obj-1", "obj-2"]);
      }
    }
  });

  it("plans create sticky note commands", () => {
    const result = planDeterministicCommand({
      message: "Add a yellow sticky note that says User Research",
      boardState: BOARD_STATE,
      selectedObjectIds: []
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky");
      expect(result.plan.operations[0]?.tool).toBe("createStickyNote");
    }
  });

  it("plans move selected commands", () => {
    const result = planDeterministicCommand({
      message: "Move selected objects right by 120",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"]
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("move-selected");
      expect(result.plan.operations).toHaveLength(2);
      expect(result.plan.operations[0]?.tool).toBe("moveObject");
    }
  });

  it("returns a useful failure when resize is requested without selection", () => {
    const result = planDeterministicCommand({
      message: "Resize selected to 220 by 140",
      boardState: BOARD_STATE,
      selectedObjectIds: []
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("resize-selected");
  });

  it("falls back to unsupported intent for unknown commands", () => {
    const result = planDeterministicCommand({
      message: "Tell me a joke",
      boardState: BOARD_STATE,
      selectedObjectIds: []
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("unsupported-command");
  });
});
