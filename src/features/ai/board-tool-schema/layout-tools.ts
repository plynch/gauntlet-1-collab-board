import type { BoardAiTool } from "@/features/ai/types";
import { viewportBoundsSchema } from "@/features/ai/board-tool-schema/shared-schemas";

export const BOARD_AI_LAYOUT_TOOLS: BoardAiTool[] = [
  {
    name: "arrangeObjectsInGrid",
    description:
      "Arrange selected objects into a grid using row-major placement.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        columns: { type: "number" },
        gapX: { type: "number" },
        gapY: { type: "number" },
        originX: { type: "number" },
        originY: { type: "number" },
        viewportBounds: viewportBoundsSchema,
        centerInViewport: { type: "boolean" },
      },
      required: ["objectIds", "columns"],
      additionalProperties: false,
    },
  },
  {
    name: "alignObjects",
    description: "Align selected objects to one shared edge or center line.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        alignment: {
          type: "string",
          enum: ["left", "center", "right", "top", "middle", "bottom"],
        },
      },
      required: ["objectIds", "alignment"],
      additionalProperties: false,
    },
  },
  {
    name: "distributeObjects",
    description:
      "Evenly distribute selected objects by center point on horizontal or vertical axis.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        axis: { type: "string", enum: ["horizontal", "vertical"] },
        viewportBounds: viewportBoundsSchema,
      },
      required: ["objectIds", "axis"],
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
    name: "moveObjects",
    description:
      "Move many objects at once using a delta, absolute point, or viewport side target.",
    parameters: {
      type: "object",
      properties: {
        objectIds: { type: "array", items: { type: "string" } },
        delta: {
          type: "object",
          properties: {
            dx: { type: "number" },
            dy: { type: "number" },
          },
          required: ["dx", "dy"],
          additionalProperties: false,
        },
        toPoint: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          required: ["x", "y"],
          additionalProperties: false,
        },
        toViewportSide: {
          type: "object",
          properties: {
            side: { type: "string", enum: ["left", "right", "top", "bottom"] },
            viewportBounds: viewportBoundsSchema,
            padding: { type: "number" },
          },
          required: ["side"],
          additionalProperties: false,
        },
      },
      required: ["objectIds"],
      additionalProperties: false,
    },
  },
];
