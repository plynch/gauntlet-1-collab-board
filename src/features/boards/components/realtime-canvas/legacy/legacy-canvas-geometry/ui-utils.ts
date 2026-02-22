import type { BoardObject } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";
import type { ResizeCorner } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";

export const CORNER_HANDLES: ResizeCorner[] = ["nw", "ne", "sw", "se"];

export function getCornerCursor(corner: ResizeCorner): string {
  return corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
}

export function getCornerPositionStyle(corner: ResizeCorner): {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  transform: string;
} {
  if (corner === "nw") {
    return { left: 0, top: 0, transform: "translate(-50%, -50%)" };
  }
  if (corner === "ne") {
    return { right: 0, top: 0, transform: "translate(50%, -50%)" };
  }
  if (corner === "sw") {
    return { left: 0, bottom: 0, transform: "translate(-50%, 50%)" };
  }
  return { right: 0, bottom: 0, transform: "translate(50%, 50%)" };
}

export function cloneBoardObjectForClipboard(objectItem: BoardObject): BoardObject {
  return {
    ...objectItem,
    gridCellColors: objectItem.gridCellColors
      ? [...objectItem.gridCellColors]
      : objectItem.gridCellColors,
    gridSectionTitles: objectItem.gridSectionTitles
      ? [...objectItem.gridSectionTitles]
      : objectItem.gridSectionTitles,
    gridSectionNotes: objectItem.gridSectionNotes
      ? [...objectItem.gridSectionNotes]
      : objectItem.gridSectionNotes,
  };
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest("input, textarea, [contenteditable='true']")) {
    return true;
  }
  return false;
}
