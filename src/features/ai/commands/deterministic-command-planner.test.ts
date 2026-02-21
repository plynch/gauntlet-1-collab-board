import { describe, expect, it } from "vitest";

import { planDeterministicCommand } from "@/features/ai/commands/deterministic-command-planner";
import type { BoardObjectSnapshot } from "@/features/ai/types";
import { getGridSectionBoundsFromGeometry } from "@/features/boards/components/realtime-canvas/container-membership-geometry";

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
    updatedAt: null,
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
    updatedAt: null,
  },
];

const FRAME_STATE: BoardObjectSnapshot = {
  id: "frame-1",
  type: "gridContainer",
  zIndex: 3,
  x: 200,
  y: 100,
  width: 520,
  height: 360,
  rotationDeg: 0,
  color: "#e2e8f0",
  text: "",
  updatedAt: null,
  gridRows: 1,
  gridCols: 1,
  gridGap: 8,
  containerTitle: "Sprint Planning",
};

const VISIBILITY_OFFSCREEN_FRAME: BoardObjectSnapshot = {
  id: "frame-2",
  type: "rect",
  zIndex: 4,
  x: 2000,
  y: 2000,
  width: 520,
  height: 360,
  rotationDeg: 0,
  color: "#e2e8f0",
  text: "",
  updatedAt: null,
};

describe("planDeterministicCommand", () => {
  it("plans clear board commands", () => {
    const result = planDeterministicCommand({
      message: "clear the board",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
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
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("clear-board-empty");
  });

  it("treats delete all shapes as clear-board command", () => {
    const result = planDeterministicCommand({
      message: "delete all shapes",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("clear-board");
      expect(result.plan.operations[0]?.tool).toBe("deleteObjects");
    }
  });

  it("treats delete everything on the board as clear-board command", () => {
    const result = planDeterministicCommand({
      message: "delete everything on the board",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
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
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("delete-selected");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("deleteObjects");
      if (result.plan.operations[0]?.tool === "deleteObjects") {
        expect(result.plan.operations[0].args.objectIds).toEqual([
          "obj-1",
          "obj-2",
        ]);
      }
    }
  });

  it("treats unselect command as selection clear", () => {
    const result = planDeterministicCommand({
      message: "unselect",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    expect(result.intent).toBe("unselect");
    expect(result.selectionUpdate).toEqual({ mode: "clear", objectIds: [] });
    if (result.planned) {
      expect(result.plan.operations).toHaveLength(0);
    }
  });

  it("does not treat unselect as a delete command", () => {
    const result = planDeterministicCommand({
      message: "unselect objects",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    expect(result.intent).toBe("unselect");
    expect(result.selectionUpdate).toEqual({ mode: "clear", objectIds: [] });
  });

  it("plans select all command with all object ids", () => {
    const result = planDeterministicCommand({
      message: "select all",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1"],
    });

    expect(result.planned).toBe(true);
    expect(result.intent).toBe("select-all");
    expect(result.selectionUpdate).toEqual({
      mode: "replace",
      objectIds: ["obj-1", "obj-2"],
    });
    if (result.planned) {
      expect(result.plan.operations).toHaveLength(0);
    }
  });

  it("plans select visible command with visible object ids", () => {
    const result = planDeterministicCommand({
      message: "select visible",
      boardState: [
        ...BOARD_STATE,
        {
          id: "obj-3",
          type: "sticky" as const,
          zIndex: 3,
          x: 2000,
          y: 2000,
          width: 220,
          height: 170,
          rotationDeg: 0,
          color: "#93c5fd",
          text: "",
          updatedAt: null,
        },
      ],
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1200,
        height: 900,
      },
    });

    expect(result.planned).toBe(true);
    expect(result.intent).toBe("select-visible");
    expect(result.selectionUpdate).toEqual({
      mode: "replace",
      objectIds: ["obj-1", "obj-2"],
    });
    if (result.planned) {
      expect(result.plan.operations).toHaveLength(0);
    }
  });

  it("plans create sticky note commands", () => {
    const result = planDeterministicCommand({
      message: "Add a yellow sticky note that says User Research",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky");
      expect(result.plan.operations[0]?.tool).toBe("createStickyNote");
    }
  });

  it("does not interpret sticky text numbers as sticky batch count", () => {
    const result = planDeterministicCommand({
      message: "Add a pink sticky note at position 520, 280 that says Case 02 note",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky");
      expect(result.plan.operations[0]?.tool).toBe("createStickyNote");
    }
  });

  it("plans create-sticky-batch for count and color prompts", () => {
    const result = planDeterministicCommand({
      message: "Create 25 red stickies",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-batch");
      expect(result.plan.operations).toHaveLength(1);
      const first = result.plan.operations[0];
      if (first?.tool === "createStickyBatch") {
        expect(first.args.count).toBe(25);
        expect(first.args.color).toBe("#fca5a5");
        expect(first.args.textPrefix).toBe("Sticky");
      }
    }
  });

  it("plans multiple sticky batches from multiple clauses", () => {
    const result = planDeterministicCommand({
      message: "Create 5 pink sticky notes Create 5 blue sticky notes",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-batch");
      expect(result.plan.operations).toHaveLength(2);

      const [first, second] = result.plan.operations;
      expect(first?.tool).toBe("createStickyBatch");
      expect(second?.tool).toBe("createStickyBatch");

      if (first?.tool === "createStickyBatch" && second?.tool === "createStickyBatch") {
        expect(first.args.count).toBe(5);
        expect(first.args.color).toBe("#f9a8d4");
        expect(second.args.count).toBe(5);
        expect(second.args.color).toBe("#93c5fd");
      }
    }
  });

  it("plans create-sticky-batch for note phrasing and bottom viewport placement", () => {
    const result = planDeterministicCommand({
      message: "Create 10 red notes on the bottom of the board",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1200,
        height: 900,
      },
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-batch");
      expect(result.plan.operations[0]?.tool).toBe("createStickyBatch");
      if (result.plan.operations[0]?.tool === "createStickyBatch") {
        expect(result.plan.operations[0].args.count).toBe(10);
        expect(result.plan.operations[0].args.color).toBe("#fca5a5");
        expect(result.plan.operations[0].args.originY).toBeGreaterThan(450);
      }
    }
  });

  it("returns actionable message for oversized sticky batch commands", () => {
    const result = planDeterministicCommand({
      message: "Create 99 red stickies",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("create-sticky-batch");
    expect(result.assistantMessage).toContain("up to 50");
  });

  it("adds sticky notes to selected frame/container target", () => {
    const result = planDeterministicCommand({
      message: "Add 3 sticky notes to the frame",
      boardState: [...BOARD_STATE, FRAME_STATE],
      selectedObjectIds: ["frame-1"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-batch");
      expect(result.plan.operations).toHaveLength(1);
      const operation = result.plan.operations[0];
      expect(operation.tool).toBe("createStickyBatch");
      if (operation.tool === "createStickyBatch") {
        expect(operation.args.count).toBe(3);
        expect(operation.args.color).toBe("#fde68a");
        expect(operation.args.originX).toBe(224);
        expect(operation.args.originY).toBe(124);
      }
    }
  });

  it("adds sticky notes to a visible frame when no frame is selected", () => {
    const result = planDeterministicCommand({
      message: "Add 3 sticky notes to the frame",
      boardState: [FRAME_STATE, VISIBILITY_OFFSCREEN_FRAME, ...BOARD_STATE],
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1280,
        height: 720,
      },
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-batch");
      const operation = result.plan.operations[0];
      if (operation.tool === "createStickyBatch") {
        expect(operation.args.originX).toBe(224);
      }
    }
  });

  it("returns actionable message when no single frame/container target exists", () => {
    const anotherFrame: BoardObjectSnapshot = {
      id: "frame-3",
      type: "gridContainer",
      zIndex: 5,
      x: 300,
      y: 140,
      width: 420,
      height: 280,
      rotationDeg: 0,
      color: "#e2e8f0",
      text: "",
      updatedAt: null,
      containerTitle: "Backlog",
    };

    const result = planDeterministicCommand({
      message: "Add 3 sticky notes to the frame",
      boardState: [FRAME_STATE, anotherFrame, ...BOARD_STATE],
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("create-sticky-batch");
    expect(result.assistantMessage).toContain("I could not find a clear frame/container");
  });

  it("plans arrange-grid command when selected objects exist", () => {
    const result = planDeterministicCommand({
      message: "Arrange selected objects in a grid with 2 columns gap x 24 y 32",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("arrange-grid");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("arrangeObjectsInGrid");
      if (result.plan.operations[0]?.tool === "arrangeObjectsInGrid") {
        expect(result.plan.operations[0].args.objectIds).toEqual([
          "obj-1",
          "obj-2",
        ]);
        expect(result.plan.operations[0].args.columns).toBe(2);
        expect(result.plan.operations[0].args.gapX).toBe(24);
        expect(result.plan.operations[0].args.gapY).toBe(32);
      }
    }
  });

  it("returns actionable message when arrange-grid has no selection", () => {
    const result = planDeterministicCommand({
      message: "Arrange selected in a grid",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("arrange-grid");
    expect(result.assistantMessage).toContain("Select two or more objects");
  });

  it("plans align-objects command when selected objects exist", () => {
    const result = planDeterministicCommand({
      message: "Align selected objects left",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("align-objects");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("alignObjects");
      if (result.plan.operations[0]?.tool === "alignObjects") {
        expect(result.plan.operations[0].args.alignment).toBe("left");
        expect(result.plan.operations[0].args.objectIds).toEqual([
          "obj-1",
          "obj-2",
        ]);
      }
    }
  });

  it("returns actionable message when align has no selection", () => {
    const result = planDeterministicCommand({
      message: "Align selected objects left",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("align-objects");
    expect(result.assistantMessage).toContain("Select two or more objects");
  });

  it("plans distribute-objects command when selected objects exist", () => {
    const boardState = [
      ...BOARD_STATE,
      {
        id: "obj-3",
        type: "sticky" as const,
        zIndex: 3,
        x: 720,
        y: 120,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fde68a",
        text: "Third",
        updatedAt: null,
      },
    ];
    const result = planDeterministicCommand({
      message: "Distribute selected objects horizontally",
      boardState,
      selectedObjectIds: ["obj-1", "obj-2", "obj-3"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("distribute-objects");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("distributeObjects");
      if (result.plan.operations[0]?.tool === "distributeObjects") {
        expect(result.plan.operations[0].args.axis).toBe("horizontal");
        expect(result.plan.operations[0].args.objectIds).toEqual([
          "obj-1",
          "obj-2",
          "obj-3",
        ]);
      }
    }
  });

  it("returns actionable message when distribute has too few selected objects", () => {
    const result = planDeterministicCommand({
      message: "Distribute selected objects horizontally",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("distribute-objects");
    expect(result.assistantMessage).toContain("Select three or more objects");
  });

  it("plans create-sticky-grid for 2x3 prompt", () => {
    const result = planDeterministicCommand({
      message: "Create a 2x3 grid of sticky notes for pros and cons",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-sticky-grid");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("createStickyBatch");
      if (result.plan.operations[0]?.tool === "createStickyBatch") {
        expect(result.plan.operations[0].args.count).toBe(6);
        expect(result.plan.operations[0].args.columns).toBe(3);
      }
    }
  });

  it("plans SWOT template creation command", () => {
    const result = planDeterministicCommand({
      message: "Create a SWOT analysis template",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1_200,
        height: 900,
      },
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("swot-template");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("createGridContainer");
      if (result.plan.operations[0]?.tool === "createGridContainer") {
        expect(result.plan.operations[0].args.containerTitle).toBe(
          "SWOT Analysis",
        );
      }
    }
  });

  it("plans add SWOT strength item commands", () => {
    const swotContainer: BoardObjectSnapshot = {
      id: "swot-1",
      type: "gridContainer",
      zIndex: 10,
      x: 120,
      y: 80,
      width: 760,
      height: 520,
      rotationDeg: 0,
      color: "#e2e8f0",
      text: "",
      gridRows: 2,
      gridCols: 2,
      gridGap: 2,
      containerTitle: "SWOT Analysis",
      gridSectionTitles: ["Strengths", "Weaknesses", "Opportunities", "Threats"],
      updatedAt: null,
    };

    const result = planDeterministicCommand({
      message: "add a strength - \"our team\"",
      boardState: [swotContainer],
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("add-swot-item");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("createStickyNote");
      if (result.plan.operations[0]?.tool === "createStickyNote") {
        expect(result.plan.operations[0].args.text).toBe("our team");
        expect(result.plan.operations[0].args.color).toBe("#86efac");

        const sectionBounds = getGridSectionBoundsFromGeometry(
          {
            x: swotContainer.x,
            y: swotContainer.y,
            width: swotContainer.width,
            height: swotContainer.height,
          },
          2,
          2,
          2,
        )[0]!;

        expect(result.plan.operations[0].args.x).toBeGreaterThanOrEqual(
          sectionBounds.left,
        );
        expect(result.plan.operations[0].args.x).toBeLessThanOrEqual(
          sectionBounds.right,
        );
        expect(result.plan.operations[0].args.y).toBeGreaterThanOrEqual(
          sectionBounds.top,
        );
        expect(result.plan.operations[0].args.y).toBeLessThanOrEqual(
          sectionBounds.bottom,
        );
      }
    }
  });

  it("returns guidance when adding SWOT items without a SWOT container", () => {
    const result = planDeterministicCommand({
      message: "add a strength - \"our team\"",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("add-swot-item");
    expect(result.assistantMessage).toContain("Create a SWOT analysis first");
  });

  it("plans create-retrospective-board command", () => {
    const result = planDeterministicCommand({
      message:
        "Set up a retrospective board with What Went Well, What Didn't, and Action Items columns",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-retrospective-board");
      expect(result.plan.operations[0]?.tool).toBe("createFrame");
      expect(result.plan.operations).toHaveLength(4);
      expect(result.plan.operations.slice(1).every((op) => op.tool === "createStickyNote")).toBe(
        true,
      );
    }
  });

  it("plans create-journey-map command with stage count", () => {
    const result = planDeterministicCommand({
      message: "Build a user journey map with 5 stages",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-journey-map");
      expect(result.plan.operations[0]?.tool).toBe("createFrame");
      expect(result.plan.operations).toHaveLength(6);
      expect(result.plan.operations.slice(1).every((op) => op.tool === "createStickyNote")).toBe(
        true,
      );
    }
  });

  it("returns guidance when journey map stage count is outside supported range", () => {
    const result = planDeterministicCommand({
      message: "Build a user journey map with 12 stages",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("create-journey-map");
    expect(result.assistantMessage).toContain("3-8");
  });

  it("returns actionable message for oversized sticky-grid prompts", () => {
    const result = planDeterministicCommand({
      message: "Create a 10x10 grid of sticky notes",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("create-sticky-grid");
    expect(result.assistantMessage).toContain("up to 50");
  });

  it("plans move selected commands", () => {
    const result = planDeterministicCommand({
      message: "Move selected objects right by 120",
      boardState: BOARD_STATE,
      selectedObjectIds: ["obj-1", "obj-2"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("move-selected");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("moveObjects");
    }
  });

  it("moves color-filtered sticky notes to the right side of the screen", () => {
    const boardState = [
      ...BOARD_STATE,
      {
        id: "obj-3",
        type: "sticky" as const,
        zIndex: 3,
        x: 220,
        y: 260,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fca5a5",
        text: "Red sticky 1",
        updatedAt: null,
      },
      {
        id: "obj-4",
        type: "sticky" as const,
        zIndex: 4,
        x: 500,
        y: 260,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fca5a5",
        text: "Red sticky 2",
        updatedAt: null,
      },
      {
        id: "obj-5",
        type: "sticky" as const,
        zIndex: 5,
        x: 780,
        y: 260,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fde68a",
        text: "Yellow sticky",
        updatedAt: null,
      },
    ];

    const result = planDeterministicCommand({
      message: "Move the red sticky notes to the right side of the screen",
      boardState,
      selectedObjectIds: [],
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1200,
        height: 800,
      },
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("move-all");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("moveObjects");
      if (result.plan.operations[0]?.tool === "moveObjects") {
        expect(result.plan.operations[0].args.objectIds).toEqual([
          "obj-3",
          "obj-4",
        ]);
        expect(result.plan.operations[0].args.toViewportSide?.side).toBe("right");
      }
    }
  });

  it("plans fit frame to contents command", () => {
    const boardState = [
      {
        id: "frame-1",
        type: "rect" as const,
        zIndex: 1,
        x: 100,
        y: 120,
        width: 520,
        height: 340,
        rotationDeg: 0,
        color: "#e2e8f0",
        text: "Sprint planning",
        updatedAt: null,
      },
      ...BOARD_STATE,
    ];
    const result = planDeterministicCommand({
      message: "Resize the frame to fit its contents with padding 24",
      boardState,
      selectedObjectIds: ["frame-1"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("fit-frame-to-contents");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("fitFrameToContents");
      if (result.plan.operations[0]?.tool === "fitFrameToContents") {
        expect(result.plan.operations[0].args.frameId).toBe("frame-1");
        expect(result.plan.operations[0].args.padding).toBe(24);
      }
    }
  });

  it("plans line shape creation commands", () => {
    const result = planDeterministicCommand({
      message: "Create a line at position 240, 200 size 280 by 12",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("create-line");
      expect(result.plan.operations).toHaveLength(1);
      expect(result.plan.operations[0]?.tool).toBe("createShape");
      if (result.plan.operations[0]?.tool === "createShape") {
        expect(result.plan.operations[0].args.type).toBe("line");
      }
    }
  });

  it("summarizes selected notes without mutating the board", () => {
    const boardState = [
      ...BOARD_STATE,
      {
        id: "obj-3",
        type: "sticky" as const,
        zIndex: 3,
        x: 700,
        y: 220,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fde68a",
        text: "Need customer interview synthesis by Friday",
        updatedAt: null,
      },
    ];
    const result = planDeterministicCommand({
      message: "Summarize selected notes",
      boardState,
      selectedObjectIds: ["obj-2", "obj-3"],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("summarize-selected");
    expect(result.assistantMessage).toContain("Summary of selected notes");
    expect(result.assistantMessage).toContain("-");
  });

  it("returns guidance when summarize has no selected notes", () => {
    const result = planDeterministicCommand({
      message: "Summarize selected notes",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("summarize-selected");
    expect(result.assistantMessage).toContain("Select one or more text objects");
  });

  it("extracts action items into sticky notes", () => {
    const boardState = [
      ...BOARD_STATE,
      {
        id: "obj-3",
        type: "sticky" as const,
        zIndex: 3,
        x: 700,
        y: 220,
        width: 220,
        height: 170,
        rotationDeg: 0,
        color: "#fde68a",
        text: "Schedule user interviews. Draft onboarding copy.",
        updatedAt: null,
      },
    ];
    const result = planDeterministicCommand({
      message: "Create action items from selected notes",
      boardState,
      selectedObjectIds: ["obj-2", "obj-3"],
    });

    expect(result.planned).toBe(true);
    if (result.planned) {
      expect(result.intent).toBe("extract-action-items");
      expect(result.plan.operations.length).toBeGreaterThan(0);
      expect(result.plan.operations.every((op) => op.tool === "createStickyNote")).toBe(
        true,
      );
      const first = result.plan.operations[0];
      if (first?.tool === "createStickyNote") {
        expect(first.args.color).toBe("#86efac");
        expect(first.args.text).toContain("Action 1:");
      }
    }
  });

  it("returns guidance when action-item extraction has no selected notes", () => {
    const result = planDeterministicCommand({
      message: "Generate action items from selected notes",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("extract-action-items");
    expect(result.assistantMessage).toContain("Select one or more text objects");
  });

  it("returns a useful failure when resize is requested without selection", () => {
    const result = planDeterministicCommand({
      message: "Resize selected to 220 by 140",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("resize-selected");
  });

  it("falls back to unsupported intent for unknown commands", () => {
    const result = planDeterministicCommand({
      message: "Tell me a joke",
      boardState: BOARD_STATE,
      selectedObjectIds: [],
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("unsupported-command");
  });
});
