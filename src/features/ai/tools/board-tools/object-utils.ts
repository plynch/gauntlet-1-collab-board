import type { BoardObjectSnapshot, BoardObjectToolKind } from "@/features/ai/types";
import type { BoardObjectDoc } from "@/features/ai/tools/board-tools/constants";
import {
  toGridCellColors,
  toNullableFiniteNumber,
  toOptionalString,
  toNumber,
  toStringArray,
  toStringValue,
  timestampToIso,
} from "@/features/ai/tools/board-tools/value-utils";

export function isObjectKind(value: unknown): value is BoardObjectToolKind {
  return (
    value === "sticky" ||
    value === "rect" ||
    value === "circle" ||
    value === "gridContainer" ||
    value === "line" ||
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional" ||
    value === "triangle" ||
    value === "star"
  );
}

export function isConnectorType(value: BoardObjectToolKind): boolean {
  return (
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional"
  );
}

export function isBackgroundContainerType(value: BoardObjectToolKind): boolean {
  return value === "gridContainer";
}

export function toObjectCenter(objectItem: BoardObjectSnapshot): {
  x: number;
  y: number;
} {
  return {
    x: objectItem.x + objectItem.width / 2,
    y: objectItem.y + objectItem.height / 2,
  };
}

export function toAnchorPoint(
  objectItem: BoardObjectSnapshot,
  anchor: "top" | "right" | "bottom" | "left",
): { x: number; y: number } {
  if (anchor === "top") {
    return { x: objectItem.x + objectItem.width / 2, y: objectItem.y };
  }
  if (anchor === "right") {
    return {
      x: objectItem.x + objectItem.width,
      y: objectItem.y + objectItem.height / 2,
    };
  }
  if (anchor === "bottom") {
    return {
      x: objectItem.x + objectItem.width / 2,
      y: objectItem.y + objectItem.height,
    };
  }
  return { x: objectItem.x, y: objectItem.y + objectItem.height / 2 };
}

export function pickAnchorsByDirection(
  fromObject: BoardObjectSnapshot,
  toObject: BoardObjectSnapshot,
): {
  fromAnchor: "top" | "right" | "bottom" | "left";
  toAnchor: "top" | "right" | "bottom" | "left";
} {
  const fromCenter = toObjectCenter(fromObject);
  const toCenter = toObjectCenter(toObject);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromAnchor: "right", toAnchor: "left" }
      : { fromAnchor: "left", toAnchor: "right" };
  }
  return dy >= 0
    ? { fromAnchor: "bottom", toAnchor: "top" }
    : { fromAnchor: "top", toAnchor: "bottom" };
}

export function toBoardObjectDoc(
  id: string,
  raw: Record<string, unknown>,
): BoardObjectSnapshot | null {
  const type = raw.type;
  if (!isObjectKind(type)) {
    return null;
  }

  return {
    id,
    type,
    zIndex: toNumber(raw.zIndex, 0),
    x: toNumber(raw.x, 0),
    y: toNumber(raw.y, 0),
    width: Math.max(1, toNumber(raw.width, 120)),
    height: Math.max(1, toNumber(raw.height, 120)),
    rotationDeg: toNumber(raw.rotationDeg, 0),
    color: toStringValue(raw.color, "#93c5fd"),
    text: toStringValue(raw.text, ""),
    gridRows: toNullableFiniteNumber(raw.gridRows),
    gridCols: toNullableFiniteNumber(raw.gridCols),
    gridGap: toNullableFiniteNumber(raw.gridGap),
    gridCellColors: toGridCellColors(raw.gridCellColors),
    containerTitle: toOptionalString(raw.containerTitle, 120),
    gridSectionTitles: toStringArray(raw.gridSectionTitles),
    gridSectionNotes: toStringArray(raw.gridSectionNotes),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}

export function toObjectBounds(objectItem: BoardObjectSnapshot): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: objectItem.x,
    right: objectItem.x + objectItem.width,
    top: objectItem.y,
    bottom: objectItem.y + objectItem.height,
  };
}

export function toCombinedBounds(objects: BoardObjectSnapshot[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
  if (objects.length === 0) {
    return null;
  }

  return {
    left: Math.min(...objects.map((objectItem) => objectItem.x)),
    right: Math.max(...objects.map((objectItem) => objectItem.x + objectItem.width)),
    top: Math.min(...objects.map((objectItem) => objectItem.y)),
    bottom: Math.max(...objects.map((objectItem) => objectItem.y + objectItem.height)),
  };
}

export function boundsOverlap(
  leftBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
  rightBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
): boolean {
  return !(
    leftBounds.right < rightBounds.left ||
    leftBounds.left > rightBounds.right ||
    leftBounds.bottom < rightBounds.top ||
    leftBounds.top > rightBounds.bottom
  );
}

export type UpdateObjectPayload = Partial<
  Pick<BoardObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">
>;
