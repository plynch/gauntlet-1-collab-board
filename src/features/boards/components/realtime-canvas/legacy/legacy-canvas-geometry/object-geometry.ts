import { CONNECTOR_MIN_SEGMENT_SIZE, GEOMETRY_ROTATION_EPSILON_DEG, GEOMETRY_WRITE_EPSILON } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";
import { toRadians } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
import type {
  BoardObjectKind,
  BoardPoint,
  ObjectBounds,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";

function normalizeRotationDeg(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

function getRotationDelta(leftRotationDeg: number, rightRotationDeg: number): number {
  const normalizedLeft = normalizeRotationDeg(leftRotationDeg);
  const normalizedRight = normalizeRotationDeg(rightRotationDeg);
  const rawDelta = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(rawDelta, 360 - rawDelta);
}

export function areGeometriesClose(
  leftGeometry: ObjectGeometry,
  rightGeometry: ObjectGeometry,
): boolean {
  return (
    Math.abs(leftGeometry.x - rightGeometry.x) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.y - rightGeometry.y) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.width - rightGeometry.width) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.height - rightGeometry.height) <= GEOMETRY_WRITE_EPSILON &&
    getRotationDelta(leftGeometry.rotationDeg, rightGeometry.rotationDeg) <=
      GEOMETRY_ROTATION_EPSILON_DEG
  );
}

export function hasMeaningfulRotation(rotationDeg: number): boolean {
  const normalized = normalizeRotationDeg(rotationDeg);
  const distanceToZero = Math.min(normalized, 360 - normalized);
  return distanceToZero > 0.25;
}

function getRotatedBounds(geometry: ObjectGeometry): ObjectBounds {
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  corners.forEach((corner) => {
    const rotatedX = centerX + corner.x * cos - corner.y * sin;
    const rotatedY = centerY + corner.x * sin + corner.y * cos;
    left = Math.min(left, rotatedX);
    right = Math.max(right, rotatedX);
    top = Math.min(top, rotatedY);
    bottom = Math.max(bottom, rotatedY);
  });
  return { left, right, top, bottom };
}

export function getObjectVisualBounds(
  type: BoardObjectKind,
  geometry: ObjectGeometry,
): ObjectBounds {
  if (type === "line") {
    const endpoints = getLineEndpoints(geometry);
    return {
      left: Math.min(endpoints.start.x, endpoints.end.x),
      right: Math.max(endpoints.start.x, endpoints.end.x),
      top: Math.min(endpoints.start.y, endpoints.end.y),
      bottom: Math.max(endpoints.start.y, endpoints.end.y),
    };
  }
  return getRotatedBounds(geometry);
}

export function mergeBounds(bounds: ObjectBounds[]): ObjectBounds | null {
  if (bounds.length === 0) {
    return null;
  }
  return bounds.reduce((combined, current) => ({
    left: Math.min(combined.left, current.left),
    right: Math.max(combined.right, current.right),
    top: Math.min(combined.top, current.top),
    bottom: Math.max(combined.bottom, current.bottom),
  }));
}

export function getLineEndpoints(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    start: { x: centerX - cos * halfLength, y: centerY - sin * halfLength },
    end: { x: centerX + cos * halfLength, y: centerY + sin * halfLength },
  };
}

export function getLineEndpointOffsets(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.width / 2;
  const centerY = geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    start: { x: centerX - cos * halfLength, y: centerY - sin * halfLength },
    end: { x: centerX + cos * halfLength, y: centerY + sin * halfLength },
  };
}

function getConnectorBoundsFromEndpoints(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  padding = 0,
): ObjectBounds {
  return {
    left: Math.min(fromPoint.x, toPoint.x) - padding,
    right: Math.max(fromPoint.x, toPoint.x) + padding,
    top: Math.min(fromPoint.y, toPoint.y) - padding,
    bottom: Math.max(fromPoint.y, toPoint.y) + padding,
  };
}

export function toConnectorGeometryFromEndpoints(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
): ObjectGeometry {
  const bounds = getConnectorBoundsFromEndpoints(fromPoint, toPoint);
  return {
    x: bounds.left,
    y: bounds.top,
    width: Math.max(CONNECTOR_MIN_SEGMENT_SIZE, bounds.right - bounds.left),
    height: Math.max(CONNECTOR_MIN_SEGMENT_SIZE, bounds.bottom - bounds.top),
    rotationDeg: 0,
  };
}

export function inflateObjectBounds(
  bounds: ObjectBounds,
  padding: number,
): ObjectBounds {
  return {
    left: bounds.left - padding,
    right: bounds.right + padding,
    top: bounds.top - padding,
    bottom: bounds.bottom + padding,
  };
}

export function doBoundsOverlap(left: ObjectBounds, right: ObjectBounds): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
}

export function getConnectorHitBounds(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  padding: number,
): ObjectBounds {
  return inflateObjectBounds(
    getConnectorBoundsFromEndpoints(fromPoint, toPoint),
    padding,
  );
}
