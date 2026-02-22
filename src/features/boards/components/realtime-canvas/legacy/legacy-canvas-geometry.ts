import type {
  BoardObject,
  BoardObjectKind,
  ConnectorAnchor,
} from "@/features/boards/types";
import {
  getPathLength,
  getPathMidPoint,
  getPointSequenceBounds,
  getRouteEndDirections,
} from "@/features/boards/components/realtime-canvas/connector-routing-geometry";

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 2;
export const ZOOM_SLIDER_MIN_PERCENT = Math.round(MIN_SCALE * 100);
export const ZOOM_SLIDER_MAX_PERCENT = Math.round(MAX_SCALE * 100);
export const ZOOM_BUTTON_STEP_PERCENT = 5;
export const ZOOM_WHEEL_INTENSITY = 0.0065;
export const ZOOM_WHEEL_MAX_EFFECTIVE_DELTA = 180;
export const POSITION_WRITE_STEP = 0.5;
export const GEOMETRY_WRITE_EPSILON = 0.3;
export const GEOMETRY_ROTATION_EPSILON_DEG = 0.35;
export const GRID_CELL_SIZE = 20;
export const CONNECTOR_MIN_SEGMENT_SIZE = 12;

export const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "top",
  "right",
  "bottom",
  "left",
];

export type BoardPoint = {
  x: number;
  y: number;
};

export type ObjectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

export type ResolvedConnectorEndpoint = {
  x: number;
  y: number;
  objectId: string | null;
  anchor: ConnectorAnchor | null;
  direction: BoardPoint | null;
  connected: boolean;
};

export type ConnectorRoutingObstacle = {
  objectId: string;
  bounds: ObjectBounds;
};

export type ConnectorRouteGeometry = {
  points: BoardPoint[];
  bounds: ObjectBounds;
  midPoint: BoardPoint;
  startDirection: BoardPoint;
  endDirection: BoardPoint;
};

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

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

function toRadians(degrees: number): number {
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

  return {
    x: gridX * step,
    y: gridY * step,
  };
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
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon
  );
}

function normalizeRotationDeg(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

function getRotationDelta(
  leftRotationDeg: number,
  rightRotationDeg: number,
): number {
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
    Math.abs(leftGeometry.width - rightGeometry.width) <=
      GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.height - rightGeometry.height) <=
      GEOMETRY_WRITE_EPSILON &&
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
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength,
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength,
    },
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
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength,
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength,
    },
  };
}

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
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }
  if (anchor === "right") {
    return { x: 1, y: 0 };
  }
  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }
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

  return {
    x: direction.x * t,
    y: direction.y * t,
  };
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
  return {
    x: direction.x * t,
    y: direction.y * t,
  };
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
    const segmentVector = {
      x: end.x - start.x,
      y: end.y - start.y,
    };
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
      bestPoint = {
        x: direction.x * t,
        y: direction.y * t,
      };
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
  return {
    x: (u - 0.5) * width,
    y: (v - 0.5) * height,
  };
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

export function doBoundsOverlap(
  left: ObjectBounds,
  right: ObjectBounds,
): boolean {
  return !(
    left.right < right.left ||
    left.left > right.right ||
    left.bottom < right.top ||
    left.top > right.bottom
  );
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
    const fromAlignment =
      fromDirection.x * forwardX + fromDirection.y * forwardY;
    if (fromAlignment < 0) {
      penalty += 2500 + Math.abs(fromAlignment) * 1400;
    } else {
      penalty += (1 - fromAlignment) * 120;
    }
  }

  if (toDirection) {
    const toForwardX = -forwardX;
    const toForwardY = -forwardY;
    const toAlignment = toDirection.x * toForwardX + toDirection.y * toForwardY;
    if (toAlignment < 0) {
      penalty += 2500 + Math.abs(toAlignment) * 1400;
    } else {
      penalty += (1 - toAlignment) * 120;
    }
  }

  return penalty;
}

function segmentIntersectsBounds(
  start: BoardPoint,
  end: BoardPoint,
  bounds: ObjectBounds,
): boolean {
  const epsilon = 0.8;
  const isHorizontal = Math.abs(start.y - end.y) <= 0.001;
  const isVertical = Math.abs(start.x - end.x) <= 0.001;

  if (isHorizontal) {
    const y = start.y;
    if (y <= bounds.top + epsilon || y >= bounds.bottom - epsilon) {
      return false;
    }

    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    return right > bounds.left + epsilon && left < bounds.right - epsilon;
  }

  if (isVertical) {
    const x = start.x;
    if (x <= bounds.left + epsilon || x >= bounds.right - epsilon) {
      return false;
    }

    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    return bottom > bounds.top + epsilon && top < bounds.bottom - epsilon;
  }

  return false;
}

function countRouteIntersections(
  points: BoardPoint[],
  obstacles: ConnectorRoutingObstacle[],
): number {
  if (points.length < 2 || obstacles.length === 0) {
    return 0;
  }

  let hits = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    obstacles.forEach((obstacle) => {
      if (segmentIntersectsBounds(segmentStart, segmentEnd, obstacle.bounds)) {
        hits += 1;
      }
    });
  }
  return hits;
}

function simplifyRoutePoints(points: BoardPoint[]): BoardPoint[] {
  if (points.length <= 2) {
    return points;
  }

  const deduped: BoardPoint[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || getDistance(previous, point) > 0.1) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: BoardPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const prevToCurrentX = current.x - previous.x;
    const prevToCurrentY = current.y - previous.y;
    const currentToNextX = next.x - current.x;
    const currentToNextY = next.y - current.y;
    const collinearX =
      Math.abs(prevToCurrentX) <= 0.001 && Math.abs(currentToNextX) <= 0.001;
    const collinearY =
      Math.abs(prevToCurrentY) <= 0.001 && Math.abs(currentToNextY) <= 0.001;

    if (collinearX || collinearY) {
      continue;
    }

    simplified.push(current);
  }
  simplified.push(deduped[deduped.length - 1]);

  return simplified;
}

function getAnchorDirection(anchor: ConnectorAnchor | null): BoardPoint | null {
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }
  if (anchor === "right") {
    return { x: 1, y: 0 };
  }
  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }
  if (anchor === "left") {
    return { x: -1, y: 0 };
  }
  return null;
}

function createOrthogonalRouteCandidates(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  detourDistance: number,
): BoardPoint[][] {
  const routes: BoardPoint[][] = [];
  const middleX = (fromPoint.x + toPoint.x) / 2;
  const middleY = (fromPoint.y + toPoint.y) / 2;
  const leftX = Math.min(fromPoint.x, toPoint.x) - detourDistance;
  const rightX = Math.max(fromPoint.x, toPoint.x) + detourDistance;
  const topY = Math.min(fromPoint.y, toPoint.y) - detourDistance;
  const bottomY = Math.max(fromPoint.y, toPoint.y) + detourDistance;

  if (
    Math.abs(fromPoint.x - toPoint.x) <= 0.001 ||
    Math.abs(fromPoint.y - toPoint.y) <= 0.001
  ) {
    routes.push([fromPoint, toPoint]);
  }

  routes.push(
    [fromPoint, { x: toPoint.x, y: fromPoint.y }, toPoint],
    [fromPoint, { x: fromPoint.x, y: toPoint.y }, toPoint],
    [
      fromPoint,
      { x: middleX, y: fromPoint.y },
      { x: middleX, y: toPoint.y },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: middleY },
      { x: toPoint.x, y: middleY },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: topY },
      { x: toPoint.x, y: topY },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: bottomY },
      { x: toPoint.x, y: bottomY },
      toPoint,
    ],
    [
      fromPoint,
      { x: leftX, y: fromPoint.y },
      { x: leftX, y: toPoint.y },
      toPoint,
    ],
    [
      fromPoint,
      { x: rightX, y: fromPoint.y },
      { x: rightX, y: toPoint.y },
      toPoint,
    ],
  );

  const unique = new Map<string, BoardPoint[]>();
  routes.forEach((candidate) => {
    const simplified = simplifyRoutePoints(candidate);
    const key = simplified
      .map(
        (point) =>
          `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`,
      )
      .join("|");
    if (!unique.has(key)) {
      unique.set(key, simplified);
    }
  });

  return Array.from(unique.values());
}

export function scoreConnectorRoute(
  points: BoardPoint[],
  obstacles: ConnectorRoutingObstacle[],
): number {
  const intersections = countRouteIntersections(points, obstacles);
  const bends = Math.max(0, points.length - 2);
  const length = getPathLength(points);
  return intersections * 1_000_000 + bends * 120 + length;
}

export function buildConnectorRouteGeometry(options: {
  from: ResolvedConnectorEndpoint;
  to: ResolvedConnectorEndpoint;
  obstacles: ConnectorRoutingObstacle[];
  padding: number;
}): ConnectorRouteGeometry {
  const start = { x: options.from.x, y: options.from.y };
  const end = { x: options.to.x, y: options.to.y };
  const fromDirection =
    options.from.direction ?? getAnchorDirection(options.from.anchor);
  const toDirection =
    options.to.direction ?? getAnchorDirection(options.to.anchor);
  const leadDistance = 30;

  const startLead = fromDirection
    ? {
        x: start.x + fromDirection.x * leadDistance,
        y: start.y + fromDirection.y * leadDistance,
      }
    : null;
  const endLead = toDirection
    ? {
        x: end.x + toDirection.x * leadDistance,
        y: end.y + toDirection.y * leadDistance,
      }
    : null;

  const routeStart = startLead ?? start;
  const routeEnd = endLead ?? end;
  const detourDistance = Math.max(
    52,
    Math.min(
      200,
      48 +
        Math.max(
          Math.abs(routeStart.x - routeEnd.x),
          Math.abs(routeStart.y - routeEnd.y),
        ) *
          0.2,
    ),
  );
  const bridgeCandidates = createOrthogonalRouteCandidates(
    routeStart,
    routeEnd,
    detourDistance,
  );

  const fullCandidates = bridgeCandidates.map((bridge) =>
    simplifyRoutePoints([
      start,
      ...(startLead ? [startLead] : []),
      ...bridge.slice(1, -1),
      ...(endLead ? [endLead] : []),
      end,
    ]),
  );

  if (fullCandidates.length === 0) {
    fullCandidates.push([start, end]);
  }

  let bestPoints = fullCandidates[0];
  let bestScore = scoreConnectorRoute(bestPoints, options.obstacles);
  for (let index = 1; index < fullCandidates.length; index += 1) {
    const candidate = fullCandidates[index];
    const candidateScore = scoreConnectorRoute(candidate, options.obstacles);
    if (candidateScore < bestScore) {
      bestScore = candidateScore;
      bestPoints = candidate;
    }
  }

  const bounds = getPointSequenceBounds(bestPoints, options.padding);
  const midPoint = getPathMidPoint(bestPoints);
  const directions = getRouteEndDirections(bestPoints);

  return {
    points: bestPoints,
    bounds,
    midPoint,
    startDirection: directions.startDirection,
    endDirection: directions.endDirection,
  };
}

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
