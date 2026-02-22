import {
  GRID_CELL_SIZE,
  MAX_SCALE,
  MIN_SCALE,
  POSITION_WRITE_STEP,
  ZOOM_WHEEL_MAX_EFFECTIVE_DELTA,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";
import type {
  BoardObjectKind,
  BoardPoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export function clampScale(nextScale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
}

export function getAcceleratedWheelZoomDelta(deltaY: number): number {
  const magnitude = Math.abs(deltaY);
  const acceleration = 1 + Math.min(2.4, magnitude / 110);
  const acceleratedMagnitude = Math.min(
    ZOOM_WHEEL_MAX_EFFECTIVE_DELTA,
    magnitude * acceleration,
  );
  return Math.sign(deltaY) * acceleratedMagnitude;
}

export function toNormalizedRect(
  start: BoardPoint,
  end: BoardPoint,
): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

export function getSpawnOffset(index: number, step: number): BoardPoint {
  if (index <= 0) {
    return { x: 0, y: 0 };
  }
  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const sideLength = ring * 2;
  const maxValueInRing = (ring * 2 + 1) ** 2 - 1;
  const delta = maxValueInRing - index;
  let gridX = 0;
  let gridY = 0;
  if (delta < sideLength) {
    gridX = ring - delta;
    gridY = -ring;
  } else if (delta < sideLength * 2) {
    const localDelta = delta - sideLength;
    gridX = -ring;
    gridY = -ring + localDelta;
  } else if (delta < sideLength * 3) {
    const localDelta = delta - sideLength * 2;
    gridX = -ring + localDelta;
    gridY = ring;
  } else {
    const localDelta = delta - sideLength * 3;
    gridX = ring;
    gridY = ring - localDelta;
  }
  return { x: gridX * step, y: gridY * step };
}

export function snapToGrid(value: number): number {
  return roundToStep(value, GRID_CELL_SIZE);
}

export function isSnapEligibleObjectType(type: BoardObjectKind): boolean {
  return (
    type === "sticky" ||
    type === "text" ||
    type === "rect" ||
    type === "circle" ||
    type === "triangle" ||
    type === "star" ||
    type === "line" ||
    type === "gridContainer"
  );
}

export function toWritePoint(point: BoardPoint): BoardPoint {
  return {
    x: roundToStep(point.x, POSITION_WRITE_STEP),
    y: roundToStep(point.y, POSITION_WRITE_STEP),
  };
}

export function getDistance(left: BoardPoint, right: BoardPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function arePointsClose(
  left: BoardPoint,
  right: BoardPoint,
  epsilon: number,
): boolean {
  return (
    Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon
  );
}
