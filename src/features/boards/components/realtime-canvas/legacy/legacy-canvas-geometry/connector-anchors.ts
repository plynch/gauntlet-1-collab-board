import { toRadians } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
import type {
  BoardPoint,
  ConnectorAnchor,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";

const TRIANGLE_POLYGON_NORMALIZED: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.06],
  [0.94, 0.92],
  [0.06, 0.92],
];

const STAR_POLYGON_NORMALIZED: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.07],
  [0.61, 0.38],
  [0.95, 0.38],
  [0.67, 0.57],
  [0.78, 0.9],
  [0.5, 0.7],
  [0.22, 0.9],
  [0.33, 0.57],
  [0.05, 0.38],
  [0.39, 0.38],
];

function rotatePointAroundCenter(
  point: BoardPoint,
  center: BoardPoint,
  rotationDeg: number,
): BoardPoint {
  const radians = toRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;
  return {
    x: center.x + offsetX * cos - offsetY * sin,
    y: center.y + offsetX * sin + offsetY * cos,
  };
}

function rotateVector(vector: BoardPoint, rotationDeg: number): BoardPoint {
  if (Math.abs(rotationDeg) < 0.001) {
    return vector;
  }
  const radians = toRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

function getAnchorDirectionVector(anchor: ConnectorAnchor): BoardPoint {
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

export function getAnchorDirectionForGeometry(
  anchor: ConnectorAnchor,
  geometry: ObjectGeometry,
): BoardPoint {
  return rotateVector(getAnchorDirectionVector(anchor), geometry.rotationDeg);
}

function getRayBoxIntersection(
  direction: BoardPoint,
  halfWidth: number,
  halfHeight: number,
): BoardPoint {
  const absDx = Math.abs(direction.x);
  const absDy = Math.abs(direction.y);
  const tX = absDx <= 0.000001 ? Number.POSITIVE_INFINITY : halfWidth / absDx;
  const tY = absDy <= 0.000001 ? Number.POSITIVE_INFINITY : halfHeight / absDy;
  const t = Math.min(tX, tY);
  if (!Number.isFinite(t)) {
    return { x: 0, y: 0 };
  }
  return { x: direction.x * t, y: direction.y * t };
}

function getRayEllipseIntersection(
  direction: BoardPoint,
  halfWidth: number,
  halfHeight: number,
): BoardPoint {
  const denominator =
    (direction.x * direction.x) / (halfWidth * halfWidth) +
    (direction.y * direction.y) / (halfHeight * halfHeight);
  if (denominator <= 0.000001) {
    return { x: 0, y: 0 };
  }
  const t = 1 / Math.sqrt(denominator);
  return { x: direction.x * t, y: direction.y * t };
}

function cross2d(left: BoardPoint, right: BoardPoint): number {
  return left.x * right.y - left.y * right.x;
}

function getRayPolygonIntersection(
  direction: BoardPoint,
  polygonPoints: BoardPoint[],
): BoardPoint | null {
  if (polygonPoints.length < 3) {
    return null;
  }
  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: BoardPoint | null = null;
  for (let index = 0; index < polygonPoints.length; index += 1) {
    const start = polygonPoints[index];
    const end = polygonPoints[(index + 1) % polygonPoints.length];
    const segmentVector = { x: end.x - start.x, y: end.y - start.y };
    const denominator = cross2d(direction, segmentVector);
    if (Math.abs(denominator) <= 0.000001) {
      continue;
    }
    const t = cross2d(start, segmentVector) / denominator;
    const u = cross2d(start, direction) / denominator;
    if (t < 0 || u < -0.000001 || u > 1.000001) {
      continue;
    }
    if (t < bestT) {
      bestT = t;
      bestPoint = { x: direction.x * t, y: direction.y * t };
    }
  }
  return bestPoint;
}

function toLocalPolygonPoint(
  u: number,
  v: number,
  width: number,
  height: number,
): BoardPoint {
  return { x: (u - 0.5) * width, y: (v - 0.5) * height };
}

export function getAnchorPointForGeometry(
  geometry: ObjectGeometry,
  anchor: ConnectorAnchor,
  shapeType:
    | "sticky"
    | "text"
    | "rect"
    | "circle"
    | "gridContainer"
    | "triangle"
    | "star" = "rect",
): BoardPoint {
  const center = {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const direction = getAnchorDirectionVector(anchor);
  let localPoint: BoardPoint;
  if (shapeType === "circle") {
    localPoint = getRayEllipseIntersection(direction, halfWidth, halfHeight);
  } else if (shapeType === "triangle" || shapeType === "star") {
    const normalizedPoints =
      shapeType === "triangle"
        ? TRIANGLE_POLYGON_NORMALIZED
        : STAR_POLYGON_NORMALIZED;
    const polygonPoints = normalizedPoints.map(([u, v]) =>
      toLocalPolygonPoint(u, v, geometry.width, geometry.height),
    );
    localPoint =
      getRayPolygonIntersection(direction, polygonPoints) ??
      getRayBoxIntersection(direction, halfWidth, halfHeight);
  } else {
    localPoint = getRayBoxIntersection(direction, halfWidth, halfHeight);
  }
  const unrotatedPoint = {
    x: center.x + localPoint.x,
    y: center.y + localPoint.y,
  };
  if (Math.abs(geometry.rotationDeg) < 0.001) {
    return unrotatedPoint;
  }
  return rotatePointAroundCenter(unrotatedPoint, center, geometry.rotationDeg);
}

export function scoreEndpointDirectionAlignment(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  fromDirection: BoardPoint | null,
  toDirection: BoardPoint | null,
): number {
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= 0.0001) {
    return 0;
  }
  let penalty = 0;
  const forwardX = deltaX / distance;
  const forwardY = deltaY / distance;
  if (fromDirection) {
    const fromAlignment = fromDirection.x * forwardX + fromDirection.y * forwardY;
    penalty +=
      fromAlignment < 0
        ? 2500 + Math.abs(fromAlignment) * 1400
        : (1 - fromAlignment) * 120;
  }
  if (toDirection) {
    const toForwardX = -forwardX;
    const toForwardY = -forwardY;
    const toAlignment = toDirection.x * toForwardX + toDirection.y * toForwardY;
    penalty +=
      toAlignment < 0
        ? 2500 + Math.abs(toAlignment) * 1400
        : (1 - toAlignment) * 120;
  }
  return penalty;
}

export function getAnchorDirection(anchor: ConnectorAnchor | null): BoardPoint | null {
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  if (anchor === "left") return { x: -1, y: 0 };
  return null;
}
