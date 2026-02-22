import {
  getPathLength,
  getPathMidPoint,
  getPointSequenceBounds,
  getRouteEndDirections,
} from "@/features/boards/components/realtime-canvas/connector-routing-geometry";
import { getDistance } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
import {
  getAnchorDirection,
  scoreEndpointDirectionAlignment,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/connector-anchors";
import type {
  BoardPoint,
  ConnectorRouteGeometry,
  ConnectorRoutingObstacle,
  ObjectBounds,
  ResolvedConnectorEndpoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";

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
    if (!collinearX && !collinearY) {
      simplified.push(current);
    }
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
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
    [fromPoint, { x: middleX, y: fromPoint.y }, { x: middleX, y: toPoint.y }, toPoint],
    [fromPoint, { x: fromPoint.x, y: middleY }, { x: toPoint.x, y: middleY }, toPoint],
    [fromPoint, { x: fromPoint.x, y: topY }, { x: toPoint.x, y: topY }, toPoint],
    [fromPoint, { x: fromPoint.x, y: bottomY }, { x: toPoint.x, y: bottomY }, toPoint],
    [fromPoint, { x: leftX, y: fromPoint.y }, { x: leftX, y: toPoint.y }, toPoint],
    [fromPoint, { x: rightX, y: fromPoint.y }, { x: rightX, y: toPoint.y }, toPoint],
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
  const fromDirection = options.from.direction ?? getAnchorDirection(options.from.anchor);
  const toDirection = options.to.direction ?? getAnchorDirection(options.to.anchor);
  const leadDistance = 30;
  const startLead = fromDirection
    ? { x: start.x + fromDirection.x * leadDistance, y: start.y + fromDirection.y * leadDistance }
    : null;
  const endLead = toDirection
    ? { x: end.x + toDirection.x * leadDistance, y: end.y + toDirection.y * leadDistance }
    : null;
  const routeStart = startLead ?? start;
  const routeEnd = endLead ?? end;
  const detourDistance = Math.max(
    52,
    Math.min(
      200,
      48 +
        Math.max(Math.abs(routeStart.x - routeEnd.x), Math.abs(routeStart.y - routeEnd.y)) *
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
  const directionPenalty = scoreEndpointDirectionAlignment(
    start,
    end,
    fromDirection,
    toDirection,
  );
  if (directionPenalty > 0 && bestPoints.length === 2) {
    const detourRoutes = createOrthogonalRouteCandidates(
      routeStart,
      routeEnd,
      detourDistance + 24,
    );
    if (detourRoutes.length > 0) {
      const points = detourRoutes[0];
      bestPoints = simplifyRoutePoints([start, ...points.slice(1, -1), end]);
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
