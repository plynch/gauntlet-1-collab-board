"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Anchor = "top" | "right" | "bottom" | "left";

type Point = {
  x: number;
  y: number;
};

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type Shape = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const STAGE_WIDTH = 900;
const STAGE_HEIGHT = 620;
const RECT_SHAPE: Shape = {
  x: 280,
  y: 140,
  width: 180,
  height: 100,
};

function getAnchorPoint(shape: Shape, anchor: Anchor): Point {
  const centerX = shape.x + shape.width / 2;
  const centerY = shape.y + shape.height / 2;

  if (anchor === "top") {
    return { x: centerX, y: shape.y };
  }
  if (anchor === "right") {
    return { x: shape.x + shape.width, y: centerY };
  }
  if (anchor === "bottom") {
    return { x: centerX, y: shape.y + shape.height };
  }
  return { x: shape.x, y: centerY };
}

function toBounds(shape: Shape, padding = 0): Bounds {
  return {
    left: shape.x - padding,
    right: shape.x + shape.width + padding,
    top: shape.y - padding,
    bottom: shape.y + shape.height + padding,
  };
}

function segmentIntersectsBounds(
  start: Point,
  end: Point,
  bounds: Bounds,
): boolean {
  const isHorizontal = Math.abs(start.y - end.y) <= 0.001;
  const isVertical = Math.abs(start.x - end.x) <= 0.001;
  const epsilon = 1;

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

function pathIntersections(points: Point[], bounds: Bounds): number {
  let count = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    if (segmentIntersectsBounds(points[index], points[index + 1], bounds)) {
      count += 1;
    }
  }
  return count;
}

function pathLength(points: Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(
      points[index + 1].x - points[index].x,
      points[index + 1].y - points[index].y,
    );
  }
  return total;
}

function simplify(points: Point[]): Point[] {
  if (points.length <= 2) {
    return points;
  }

  const deduped: Point[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (
      !previous ||
      Math.hypot(previous.x - point.x, previous.y - point.y) > 0.1
    ) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const result: Point[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];
    const sameVertical =
      Math.abs(previous.x - current.x) <= 0.001 &&
      Math.abs(current.x - next.x) <= 0.001;
    const sameHorizontal =
      Math.abs(previous.y - current.y) <= 0.001 &&
      Math.abs(current.y - next.y) <= 0.001;
    if (!sameVertical && !sameHorizontal) {
      result.push(current);
    }
  }
  result.push(deduped[deduped.length - 1]);
  return result;
}

function roundedPath(points: Point[]): string {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  const radius = 16;
  let d = `M ${points[0].x} ${points[0].y}`;

  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const inVector = { x: current.x - prev.x, y: current.y - prev.y };
    const outVector = { x: next.x - current.x, y: next.y - current.y };
    const inLength = Math.hypot(inVector.x, inVector.y);
    const outLength = Math.hypot(outVector.x, outVector.y);
    if (inLength <= 0.001 || outLength <= 0.001) {
      d += ` L ${current.x} ${current.y}`;
      continue;
    }

    const inDir = { x: inVector.x / inLength, y: inVector.y / inLength };
    const outDir = { x: outVector.x / outLength, y: outVector.y / outLength };
    const isTurn =
      Math.abs(inDir.x - outDir.x) > 0.001 ||
      Math.abs(inDir.y - outDir.y) > 0.001;
    if (!isTurn) {
      d += ` L ${current.x} ${current.y}`;
      continue;
    }

    const cornerRadius = Math.min(radius, inLength / 2, outLength / 2);
    const cornerStart = {
      x: current.x - inDir.x * cornerRadius,
      y: current.y - inDir.y * cornerRadius,
    };
    const cornerEnd = {
      x: current.x + outDir.x * cornerRadius,
      y: current.y + outDir.y * cornerRadius,
    };
    d += ` L ${cornerStart.x} ${cornerStart.y}`;
    d += ` Q ${current.x} ${current.y} ${cornerEnd.x} ${cornerEnd.y}`;
  }

  const end = points[points.length - 1];
  d += ` L ${end.x} ${end.y}`;
  return d;
}

function chooseRoute(from: Point, to: Point, obstacles: Bounds[]): Point[] {
  const detour = 80;
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const candidates = [
    [from, { x: to.x, y: from.y }, to],
    [from, { x: from.x, y: to.y }, to],
    [from, { x: midX, y: from.y }, { x: midX, y: to.y }, to],
    [from, { x: from.x, y: midY }, { x: to.x, y: midY }, to],
    [
      from,
      { x: from.x, y: Math.min(from.y, to.y) - detour },
      { x: to.x, y: Math.min(from.y, to.y) - detour },
      to,
    ],
    [
      from,
      { x: from.x, y: Math.max(from.y, to.y) + detour },
      { x: to.x, y: Math.max(from.y, to.y) + detour },
      to,
    ],
  ].map((points) => simplify(points));

  let best = candidates[0];
  let bestScore = Number.POSITIVE_INFINITY;
  candidates.forEach((candidate) => {
    const intersections = obstacles.reduce(
      (sum, obstacle) => sum + pathIntersections(candidate, obstacle),
      0,
    );
    const bends = Math.max(0, candidate.length - 2);
    const score =
      intersections * 1_000_000 + bends * 150 + pathLength(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  });

  return best;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export default function ConnectorRoutingLab() {
  const [circle, setCircle] = useState<Shape>({
    x: 560,
    y: 380,
    width: 120,
    height: 120,
  });
  const dragRef = useRef<DragState | null>(null);

  const routeState = useMemo(() => {
    const fromAnchor: Anchor = "bottom";
    const fromPoint = getAnchorPoint(RECT_SHAPE, fromAnchor);
    const circleAnchors: Anchor[] = ["top", "right", "bottom", "left"];
    const rectObstacle = toBounds(RECT_SHAPE, 14);
    const circleObstacle = toBounds(circle, 14);
    const circleTrueBounds = toBounds(circle, 0);

    let bestAnchor: Anchor = "left";
    let bestRoute: Point[] = [];
    let bestScore = Number.POSITIVE_INFINITY;

    circleAnchors.forEach((anchor) => {
      const toPoint = getAnchorPoint(circle, anchor);
      const route = chooseRoute(fromPoint, toPoint, [
        rectObstacle,
        circleObstacle,
      ]);
      const overlapCount = pathIntersections(route, circleTrueBounds);
      const score =
        overlapCount * 1_000_000 +
        pathLength(route) +
        Math.max(0, route.length - 2) * 120;
      if (score < bestScore) {
        bestScore = score;
        bestAnchor = anchor;
        bestRoute = route;
      }
    });

    return {
      fromPoint,
      toAnchor: bestAnchor,
      route: bestRoute,
      overlapsCircle: pathIntersections(bestRoute, circleTrueBounds) > 0,
    };
  }, [circle]);

  const routePath = roundedPath(routeState.route);

    const handleCirclePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: circle.x,
      originY: circle.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

    const handleCirclePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    setCircle((previous) => ({
      ...previous,
      x: Math.max(
        20,
        Math.min(STAGE_WIDTH - previous.width - 20, dragState.originX + dx),
      ),
      y: Math.max(
        20,
        Math.min(STAGE_HEIGHT - previous.height - 20, dragState.originY + dy),
      ),
    }));
  };

    const handleCirclePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#e5e7eb",
        padding: 24,
      }}
    >
      <section
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          position: "relative",
          border: "1px solid #94a3b8",
          backgroundColor: "#f8fafc",
          backgroundImage:
            "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      >
        <svg
          data-testid="lab-connector-svg"
          style={{
            position: "absolute",
            inset: 0,
            overflow: "visible",
          }}
          viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}
        >
          <path
            data-testid="lab-connector-path"
            d={routePath}
            stroke="#1e293b"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>

        <div
          style={{
            position: "absolute",
            left: RECT_SHAPE.x,
            top: RECT_SHAPE.y,
            width: RECT_SHAPE.width,
            height: RECT_SHAPE.height,
            background: "#93c5fd",
            border: "2px solid #3b82f6",
            borderRadius: 4,
          }}
        />

        <div
          data-testid="lab-circle"
          onPointerDown={handleCirclePointerDown}
          onPointerMove={handleCirclePointerMove}
          onPointerUp={handleCirclePointerUp}
          style={{
            position: "absolute",
            left: circle.x,
            top: circle.y,
            width: circle.width,
            height: circle.height,
            borderRadius: "50%",
            background: "#fca5a5",
            border: "2px solid #ef4444",
            cursor: "grab",
            touchAction: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            fontSize: 13,
            color: "#0f172a",
          }}
        >
          <div>
            to-anchor:{" "}
            <strong data-testid="to-anchor">{routeState.toAnchor}</strong>
          </div>
          <div>
            overlaps-target:{" "}
            <strong data-testid="overlap-target">
              {routeState.overlapsCircle ? "true" : "false"}
            </strong>
          </div>
        </div>
      </section>
    </main>
  );
}
