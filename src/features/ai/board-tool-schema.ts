import type { BoardAiTool } from "@/features/ai/types";

export const BOARD_AI_TOOLS: BoardAiTool[] = [
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
    name: "createShape",
    description: "Create a shape object on the board.",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["rect", "circle", "triangle", "star"],
        },
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
        cellColors: {
          type: "array",
          items: { type: "string" },
        },
        containerTitle: { type: "string" },
        sectionTitles: {
          type: "array",
          items: { type: "string" },
        },
        sectionNotes: {
          type: "array",
          items: { type: "string" },
        },
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
  {
    name: "arrangeObjectsInGrid",
    description:
      "Arrange selected objects into a grid using row-major placement.",
    parameters: {
      type: "object",
      properties: {
        objectIds: {
          type: "array",
          items: { type: "string" },
        },
        columns: { type: "number" },
        gapX: { type: "number" },
        gapY: { type: "number" },
        originX: { type: "number" },
        originY: { type: "number" },
      },
      required: ["objectIds", "columns"],
      additionalProperties: false,
    },
  },
  {
    name: "moveObject",
    description: "Move one object to a specific coordinate.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
      },
      required: ["objectId", "x", "y"],
      additionalProperties: false,
    },
  },
  {
    name: "resizeObject",
    description: "Resize one object.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string" },
        width: { type: "number" },
        height: { type: "number" },
      },
      required: ["objectId", "width", "height"],
      additionalProperties: false,
    },
  },
  {
    name: "updateText",
    description: "Update text on a sticky note or text-capable object.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string" },
        newText: { type: "string" },
      },
      required: ["objectId", "newText"],
      additionalProperties: false,
    },
  },
  {
    name: "changeColor",
    description: "Change an object's color.",
    parameters: {
      type: "object",
      properties: {
        objectId: { type: "string" },
        color: { type: "string" },
      },
      required: ["objectId", "color"],
      additionalProperties: false,
    },
  },
  {
    name: "deleteObjects",
    description: "Delete one or more objects by id.",
    parameters: {
      type: "object",
      properties: {
        objectIds: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["objectIds"],
      additionalProperties: false,
    },
  },
  {
    name: "getBoardState",
    description: "Retrieve current board objects for context.",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];
