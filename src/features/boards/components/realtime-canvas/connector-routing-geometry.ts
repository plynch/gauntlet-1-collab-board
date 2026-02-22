export type RoutingPoint = {
  x: number;
  y: number;
};

export type RoutingBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function formatPathNumber(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function getDistance(left: RoutingPoint, right: RoutingPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function getSegmentDirection(
  fromPoint: RoutingPoint,
  toPoint: RoutingPoint,
): RoutingPoint {
  const dx = toPoint.x - fromPoint.x;
  const dy = toPoint.y - fromPoint.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude <= 0.0001) {
    return { x: 1, y: 0 };
  }

  return {
    x: dx / magnitude,
    y: dy / magnitude,
  };
}

export function getPointSequenceBounds(
  points: RoutingPoint[],
  padding = 0,
): RoutingBounds {
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  return {
    left: Math.min(...xValues) - padding,
    right: Math.max(...xValues) + padding,
    top: Math.min(...yValues) - padding,
    bottom: Math.max(...yValues) + padding,
  };
}

export function getPathLength(points: RoutingPoint[]): number {
  if (points.length < 2) {
    return 0;
  }

  let length = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    length += getDistance(points[index], points[index + 1]);
  }
  return length;
}

export function getPathMidPoint(points: RoutingPoint[]): RoutingPoint {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  if (points.length === 1) {
    return points[0];
  }

  const totalLength = getPathLength(points);
  if (totalLength <= 0.0001) {
    return points[0];
  }

  const midpointDistance = totalLength / 2;
  let traversed = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const segmentLength = getDistance(start, end);
    if (traversed + segmentLength >= midpointDistance) {
      const remaining = midpointDistance - traversed;
      const ratio = segmentLength <= 0.0001 ? 0 : remaining / segmentLength;
      return {
        x: start.x + (end.x - start.x) * ratio,
        y: start.y + (end.y - start.y) * ratio,
      };
    }
    traversed += segmentLength;
  }

  return points[points.length - 1];
}

export function getRouteEndDirections(points: RoutingPoint[]): {
  startDirection: RoutingPoint;
  endDirection: RoutingPoint;
} {
  if (points.length < 2) {
    return {
      startDirection: { x: 1, y: 0 },
      endDirection: { x: 1, y: 0 },
    };
  }

  let startDirection: RoutingPoint = { x: 1, y: 0 };
  for (let index = 0; index < points.length - 1; index += 1) {
    const direction = getSegmentDirection(points[index], points[index + 1]);
    if (Math.hypot(direction.x, direction.y) > 0.0001) {
      startDirection = direction;
      break;
    }
  }

  let endDirection: RoutingPoint = { x: 1, y: 0 };
  for (let index = points.length - 1; index > 0; index -= 1) {
    const direction = getSegmentDirection(points[index - 1], points[index]);
    if (Math.hypot(direction.x, direction.y) > 0.0001) {
      endDirection = direction;
      break;
    }
  }

  return {
    startDirection,
    endDirection,
  };
}

export function toRoundedConnectorPath(
  points: RoutingPoint[],
  cornerRadius = 14,
): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    const point = points[0];
    return `M ${formatPathNumber(point.x)} ${formatPathNumber(point.y)}`;
  }

  let pathData = `M ${formatPathNumber(points[0].x)} ${formatPathNumber(points[0].y)}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inDirection = getSegmentDirection(previous, current);
    const outDirection = getSegmentDirection(current, next);
    const inLength = getDistance(previous, current);
    const outLength = getDistance(current, next);
    const sameDirection =
      Math.abs(inDirection.x - outDirection.x) <= 0.001 &&
      Math.abs(inDirection.y - outDirection.y) <= 0.001;

    if (sameDirection || inLength <= 0.001 || outLength <= 0.001) {
      pathData += ` L ${formatPathNumber(current.x)} ${formatPathNumber(current.y)}`;
      continue;
    }

    const radius = Math.max(
      0,
      Math.min(cornerRadius, inLength / 2, outLength / 2),
    );
    const cornerStart = {
      x: current.x - inDirection.x * radius,
      y: current.y - inDirection.y * radius,
    };
    const cornerEnd = {
      x: current.x + outDirection.x * radius,
      y: current.y + outDirection.y * radius,
    };

    pathData += ` L ${formatPathNumber(cornerStart.x)} ${formatPathNumber(cornerStart.y)}`;
    pathData += ` Q ${formatPathNumber(current.x)} ${formatPathNumber(current.y)} ${formatPathNumber(cornerEnd.x)} ${formatPathNumber(cornerEnd.y)}`;
  }

  const end = points[points.length - 1];
  pathData += ` L ${formatPathNumber(end.x)} ${formatPathNumber(end.y)}`;

  return pathData;
}
