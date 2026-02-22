import type { BoardObject, BoardObjectKind } from "@/features/boards/types";

export type LabUser = {
  uid: string;
  email: string;
};

export type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  initialWidth: number;
  initialHeight: number;
};

export type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

export const STAGE_WIDTH = 1240;
export const STAGE_HEIGHT = 860;
export const CONTAINER_ID = "lab-swot-container";
export const GRID_ROWS = 2;
export const GRID_COLS = 2;
export const GRID_GAP = 2;
export const SECTION_TITLES = [
  "Strengths",
  "Weaknesses",
  "Opportunities",
  "Threats",
] as const;
export const STICKY_SIZE = { width: 118, height: 76 };
export const MIN_CONTAINER_WIDTH = 420;
export const MIN_CONTAINER_HEIGHT = 300;
export const RELATIVE_POSITION_PRESETS: Array<{ x: number; y: number }> = [
  { x: 0.32, y: 0.28 },
  { x: 0.62, y: 0.42 },
  { x: 0.48, y: 0.68 },
  { x: 0.72, y: 0.26 },
];

export function isConnectorKind(kind: BoardObjectKind): boolean {
  return (
    kind === "connectorUndirected" ||
    kind === "connectorArrow" ||
    kind === "connectorBidirectional"
  );
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function getDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function buildContainerObject(
  overrides?: Partial<BoardObject>,
): BoardObject {
  return {
    id: CONTAINER_ID,
    type: "gridContainer",
    zIndex: 1,
    x: 180,
    y: 150,
    width: 640,
    height: 420,
    rotationDeg: 0,
    color: "#e2e8f0",
    text: "",
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    gridGap: GRID_GAP,
    gridCellColors: ["#a7f3d0", "#fecaca", "#a7f3d0", "#fecaca"],
    containerTitle: "SWOT Analysis",
    gridSectionTitles: [...SECTION_TITLES],
    gridSectionNotes: ["", "", "", ""],
    updatedAt: null,
    ...overrides,
  };
}

export function getObjectGeometry(objectItem: BoardObject): ObjectGeometry {
  return {
    x: objectItem.x,
    y: objectItem.y,
    width: objectItem.width,
    height: objectItem.height,
    rotationDeg: objectItem.rotationDeg,
  };
}

export function getStickyCenter(sticky: BoardObject): { x: number; y: number } {
  return {
    x: sticky.x + sticky.width / 2,
    y: sticky.y + sticky.height / 2,
  };
}
