import type { BoardObject } from "@/features/boards/types";
import {
  getPathLength,
  getPointSequenceBounds,
  toRoundedConnectorPath,
} from "@/features/boards/components/realtime-canvas/connector-routing-geometry";
import type { Viewport } from "@/features/boards/components/realtime-canvas/board-scene-utils";

type RoutingPoint = {
  x: number;
  y: number;
};

type ObstacleBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type CachedConnectorRoute = {
  points: RoutingPoint[];
  bounds: ObstacleBounds;
  midPoint: RoutingPoint;
  path: string;
};

type RouteCandidate = {
  pathData: string;
  points: RoutingPoint[];
  bounds: ObstacleBounds;
  midPoint: RoutingPoint;
};

const OBSTACLE_PADDING = 4;
const ROUTE_CACHE_SIZE = 250;

function getSegmentDirection(fromPoint: RoutingPoint, toPoint: RoutingPoint): RoutingPoint {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude <= 0.0001) {
    return { x: 1, y: 0 };
  }
  return { x: dx / magnitude, y: dy / magnitude };
}

function segmentIntersectsBounds(start: RoutingPoint, end: RoutingPoint, bounds: ObstacleBounds): boolean {
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

function simplifyRoutePoints(points: RoutingPoint[]): RoutingPoint[] {
  if (points.length <= 2) {
    return points;
  }

  const deduped: RoutingPoint[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 0.1) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: RoutingPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const prevToCurrentX = current.x - previous.x;
    const prevToCurrentY = current.y - previous.y;
    const currentToNextX = next.x - current.x;
    const currentToNextY = next.y - current.y;
    const collinearX = Math.abs(prevToCurrentX) <= 0.001 && Math.abs(currentToNextX) <= 0.001;
    const collinearY = Math.abs(prevToCurrentY) <= 0.001 && Math.abs(currentToNextY) <= 0.001;

    if (collinearX || collinearY) {
      continue;
    }

    simplified.push(current);
  }
  simplified.push(deduped[deduped.length - 1]);

  return simplified;
}

function createOrthogonalRouteCandidates(
  fromPoint: RoutingPoint,
  toPoint: RoutingPoint,
  detourDistance: number,
): RoutingPoint[][] {
  const routes: RoutingPoint[][] = [];
  const middleX = (fromPoint.x + toPoint.x) / 2;
  const middleY = (fromPoint.y + toPoint.y) / 2;
  const leftX = Math.min(fromPoint.x, toPoint.x) - detourDistance;
  const rightX = Math.max(fromPoint.x, toPoint.x) + detourDistance;
  if (Math.abs(fromPoint.x - toPoint.x) <= 0.001 || Math.abs(fromPoint.y - toPoint.y) <= 0.001) {
    routes.push([fromPoint, toPoint]);
  }

  routes.push(
    [fromPoint, { x: toPoint.x, y: fromPoint.y }, toPoint],
    [fromPoint, { x: fromPoint.x, y: toPoint.y }, toPoint],
    [fromPoint, { x: middleX, y: fromPoint.y }, { x: middleX, y: toPoint.y }, toPoint],
    [fromPoint, { x: fromPoint.x, y: middleY }, { x: toPoint.x, y: middleY }, toPoint],
    [fromPoint, { x: leftX, y: fromPoint.y }, { x: leftX, y: toPoint.y }, toPoint],
    [fromPoint, { x: rightX, y: fromPoint.y }, { x: rightX, y: toPoint.y }, toPoint],
  );

  const unique = new Map<string, RoutingPoint[]>();
  routes.forEach((candidate) => {
    const simplified = simplifyRoutePoints(candidate);
    const key = simplified
      .map((point) => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`)
      .join("|");
    if (!unique.has(key)) {
      unique.set(key, simplified);
    }
  });

  return Array.from(unique.values());
}

function countRouteIntersections(points: RoutingPoint[], obstacles: ObstacleBounds[]): number {
  if (points.length < 2 || obstacles.length === 0) {
    return 0;
  }

  let hits = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    for (const obstacle of obstacles) {
      if (segmentIntersectsBounds(segmentStart, segmentEnd, obstacle)) {
        hits += 1;
      }
    }
  }
  return hits;
}

function scoreConnectorRoute(points: RoutingPoint[], obstacles: ObstacleBounds[]): number {
  const intersections = countRouteIntersections(points, obstacles);
  const bends = Math.max(0, points.length - 2);
  const length = getPathLength(points);
  return intersections * 1_000_000 + bends * 120 + length;
}

function buildObstacleIndex(objects: BoardObject[], skipIds: Set<string>): ObstacleBounds[] {
  return objects
    .filter((objectItem) => !skipIds.has(objectItem.id))
    .map((objectItem) => ({
      left: objectItem.x,
      right: objectItem.x + objectItem.width,
      top: objectItem.y,
      bottom: objectItem.y + objectItem.height,
    }));
}

function buildObstacleVersion(objects: BoardObject[], skipIds: Set<string>): string {
  const parts: string[] = [];
  for (const objectItem of objects) {
    if (skipIds.has(objectItem.id)) {
      continue;
    }

    parts.push(
      `${objectItem.id}|${objectItem.x.toFixed(2)},${objectItem.y.toFixed(2)},${objectItem.width.toFixed(
        2,
      )},${objectItem.height.toFixed(2)},${objectItem.type}`,
    );
  }

  return `${parts.length}:${parts.join("|")}`;
}

function resolveCandidateRoute(
  from: RoutingPoint,
  to: RoutingPoint,
  obstacles: ObstacleBounds[],
): RouteCandidate {
  const startDirection = getSegmentDirection({ x: from.x, y: from.y }, { x: to.x, y: to.y });
  const leadDistance = 30;
  const routeStart = {
    x: from.x + startDirection.x * leadDistance,
    y: from.y + startDirection.y * leadDistance,
  };
  const detourDistance = Math.max(
    52,
    Math.min(
      200,
      48 + Math.max(Math.abs(routeStart.x - to.x), Math.abs(routeStart.y - to.y)) * 0.2,
    ),
  );

  const candidates = createOrthogonalRouteCandidates(routeStart, to, detourDistance);
  let bestPoints = [from, to];
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const normalized = simplifyRoutePoints([from, ...candidate.slice(1, -1), to]);
    const score = scoreConnectorRoute(normalized, obstacles);
    if (score < bestScore) {
      bestScore = score;
      bestPoints = normalized;
    }
  }

  const bounds = getPointSequenceBounds(bestPoints, 10);
  const midPoint = {
    x: (from.x + to.x) / 2,
    y: (from.y + to.y) / 2,
  };
  const path = toRoundedConnectorPath(bestPoints, 14);
  return { pathData: path, points: bestPoints, bounds, midPoint };
}

export function isRouteVisible(
  bounds: ObstacleBounds,
  viewport: Viewport,
  containerWidth: number,
  containerHeight: number,
  padding = 300,
): boolean {
  const worldViewport = {
    left: (-viewport.x - padding) / Math.max(viewport.scale, 0.001),
    right: (-viewport.x + containerWidth + padding) / Math.max(viewport.scale, 0.001),
    top: (-viewport.y - padding) / Math.max(viewport.scale, 0.001),
    bottom: (-viewport.y + containerHeight + padding) / Math.max(viewport.scale, 0.001),
  };

  return bounds.right >= worldViewport.left && bounds.left <= worldViewport.right && bounds.bottom >= worldViewport.top && bounds.top <= worldViewport.bottom;
}

export function buildConnectorRouteEngine(): {
  resolveRoute: (
    connectorId: string,
    from: BoardObject | null,
    to: BoardObject | null,
    objects: BoardObject[],
    containerWidth: number,
    containerHeight: number,
    viewport: Viewport,
  ) => CachedConnectorRoute | null;
} {
  const routeCache = new Map<string, CachedConnectorRoute>();

  const trimCache = (): void => {
    if (routeCache.size <= ROUTE_CACHE_SIZE) {
      return;
    }
    const keepFrom = Math.max(0, routeCache.size - ROUTE_CACHE_SIZE);
    const entries = Array.from(routeCache.entries());
    for (let index = 0; index < keepFrom; index += 1) {
      routeCache.delete(entries[index][0]);
    }
  };

  const makeKey = (
    connectorId: string,
    from: BoardObject,
    to: BoardObject,
    obstacleSignature: string,
    viewportScale: number,
  ): string =>
    `${connectorId}|${from.x.toFixed(2)},${from.y.toFixed(2)},${to.x.toFixed(2)},${to.y.toFixed(2)}|${Math.round(
      viewportScale * 1000,
    )}|${obstacleSignature}`;

  const buildObstacleSignature = (objects: BoardObject[], skipIds: Set<string>): string =>
    buildObstacleVersion(objects, skipIds);

  return {
    resolveRoute: (connectorId, from, to, objects, containerWidth, containerHeight, viewport) => {
      if (!from || !to) {
        return null;
      }

      const skipIds = new Set([from.id, to.id, connectorId]);
      const obstacleSignature = buildObstacleSignature(objects, skipIds);
      const key = makeKey(connectorId, from, to, obstacleSignature, viewport.scale);
      const cached = routeCache.get(key);
      if (cached) {
        if (isRouteVisible(cached.bounds, viewport, containerWidth, containerHeight)) {
          return cached;
        }
        return null;
      }

      const obstacles = buildObstacleIndex(objects, skipIds);
      const fromPoint = {
        x: from.x + from.width / 2,
        y: from.y + from.height / 2,
      };
      const toPoint = {
        x: to.x + to.width / 2,
        y: to.y + to.height / 2,
      };
      const route = resolveCandidateRoute(fromPoint, toPoint, obstacles.map((obstacle) => ({
        ...obstacle,
        left: obstacle.left - OBSTACLE_PADDING,
        right: obstacle.right + OBSTACLE_PADDING,
        top: obstacle.top - OBSTACLE_PADDING,
        bottom: obstacle.bottom + OBSTACLE_PADDING,
      })));
      const result: CachedConnectorRoute = {
        points: route.points,
        bounds: route.bounds,
        midPoint: route.midPoint,
        path: route.pathData,
      };
      routeCache.set(key, result);
      trimCache();
      return isRouteVisible(result.bounds, viewport, containerWidth, containerHeight)
        ? result
        : null;
    },
  };
}
