import type { BoardAiTool } from "@/features/ai/types";

export const BOARD_AI_EDIT_TOOLS: BoardAiTool[] = [
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
        objectIds: { type: "array", items: { type: "string" } },
      },
      required: ["objectIds"],
      additionalProperties: false,
    },
  },
  {
    name: "fitFrameToContents",
    description:
      "Resize a frame rectangle so it tightly encloses overlapping board content with optional padding.",
    parameters: {
      type: "object",
      properties: {
        frameId: { type: "string" },
        padding: { type: "number" },
      },
      required: ["frameId"],
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
