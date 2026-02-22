import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import type { BoardToolCall } from "@/features/ai/types";

export const MAX_TOOL_CALLS = 50;
export const MAX_TEXT_PREVIEW_CHARS = 120;

export const CANONICAL_TOOL_NAMES = BOARD_AI_TOOLS.map(
  (tool) => tool.name,
) as BoardToolCall["tool"][];

export const TOOL_NAME_ALIASES: Record<string, BoardToolCall["tool"]> = {
  createSticky: "createStickyNote",
  create_sticky: "createStickyNote",
  sticky: "createStickyNote",
  addSticky: "createStickyNote",
  add_sticky: "createStickyNote",
  createNote: "createStickyNote",
  create_note: "createStickyNote",
  createStickyBatch: "createStickyBatch",
  create_sticky_batch: "createStickyBatch",
  createStickies: "createStickyBatch",
  batchStickies: "createStickyBatch",
  batch_stickies: "createStickyBatch",
  createLine: "createShape",
  create_line: "createShape",
  line: "createShape",
  moveObjects: "moveObjects",
  move_objects: "moveObjects",
  moveAll: "moveObjects",
  move_all: "moveObjects",
  moveSelection: "moveObjects",
  move_selection: "moveObjects",
  move: "moveObject",
  moveSelected: "moveObject",
  resize: "resizeObject",
  resizeSelected: "resizeObject",
  setText: "updateText",
  updateObjectText: "updateText",
  setColor: "changeColor",
  updateColor: "changeColor",
  color: "changeColor",
  delete: "deleteObjects",
  deleteObject: "deleteObjects",
  removeObject: "deleteObjects",
  align: "alignObjects",
  distribute: "distributeObjects",
  arrangeGrid: "arrangeObjectsInGrid",
  arrangeInGrid: "arrangeObjectsInGrid",
  fitFrame: "fitFrameToContents",
  fitFrameToContents: "fitFrameToContents",
  fit_frame_to_contents: "fitFrameToContents",
};

export const SHAPE_TYPE_ALIASES: Record<
  string,
  "rect" | "circle" | "line" | "triangle" | "star"
> = {
  rectangle: "rect",
  square: "rect",
  oval: "circle",
  arrow: "line",
};
