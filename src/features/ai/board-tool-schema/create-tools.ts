import type { BoardAiTool } from "@/features/ai/types";

export const BOARD_AI_CREATE_TOOLS: BoardAiTool[] = [
  {
    name: "createStickyNote",
    description: "Create a sticky note on the board.",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        color: { type: "string" },
      },
      required: ["text", "x", "y", "color"],
      additionalProperties: false,
    },
  },
  {
    name: "createStickyBatch",
    description:
      "Create many sticky notes in a grid-style batch from a single tool call.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number" },
        color: { type: "string" },
        originX: { type: "number" },
        originY: { type: "number" },
        columns: { type: "number" },
        gapX: { type: "number" },
        gapY: { type: "number" },
        textPrefix: { type: "string" },
      },
      required: ["count", "color", "originX", "originY"],
      additionalProperties: false,
    },
  },
  {
    name: "createShape",
    description: "Create a shape object on the board.",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["rect", "circle", "line", "triangle", "star"] },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        color: { type: "string" },
      },
      required: ["type", "x", "y", "width", "height", "color"],
      additionalProperties: false,
    },
  },
  {
    name: "createShapeBatch",
    description:
      "Create many shapes in a grid-style batch from a single tool call.",
    parameters: {
      type: "object",
      properties: {
        count: { type: "number" },
        type: { type: "string", enum: ["rect", "circle", "line", "triangle", "star"] },
        originX: { type: "number" },
        originY: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        color: { type: "string" },
        colors: { type: "array", items: { type: "string" } },
        columns: { type: "number" },
        gapX: { type: "number" },
        gapY: { type: "number" },
      },
      required: ["count", "type", "originX", "originY"],
      additionalProperties: false,
    },
  },
  {
    name: "createGridContainer",
    description:
      "Create a grid container object with rows, columns, gap, and optional per-cell colors.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        rows: { type: "number" },
        cols: { type: "number" },
        gap: { type: "number" },
        cellColors: { type: "array", items: { type: "string" } },
        containerTitle: { type: "string" },
        sectionTitles: { type: "array", items: { type: "string" } },
        sectionNotes: { type: "array", items: { type: "string" } },
      },
      required: ["x", "y", "width", "height", "rows", "cols", "gap"],
      additionalProperties: false,
    },
  },
  {
    name: "createFrame",
    description: "Create a frame to group board content.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["title", "x", "y", "width", "height"],
      additionalProperties: false,
    },
  },
  {
    name: "createConnector",
    description: "Connect two objects with an undirected or arrow connector.",
    parameters: {
      type: "object",
      properties: {
        fromId: { type: "string" },
        toId: { type: "string" },
        style: {
          type: "string",
          enum: ["undirected", "one-way-arrow", "two-way-arrow"],
        },
      },
      required: ["fromId", "toId", "style"],
      additionalProperties: false,
    },
  },
];
