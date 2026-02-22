"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  buildBestRoute,
  roundedPath,
  RECT_SHAPE,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  type Shape,
} from "@/features/boards/components/connector-routing-lab-logic";

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
  const routeState = useMemo(() => buildBestRoute(circle), [circle]);
  const routePath = roundedPath(routeState.route);

  const handleCirclePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const handleCirclePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    const dx = event.clientX - dragState.startX;
    const dy = event.clientY - dragState.startY;
    setCircle((previous) => ({
      ...previous,
      x: Math.max(20, Math.min(STAGE_WIDTH - previous.width - 20, dragState.originX + dx)),
      y: Math.max(20, Math.min(STAGE_HEIGHT - previous.height - 20, dragState.originY + dy)),
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
    <main style={mainStyle}>
      <section style={stageStyle}>
        <svg data-testid="lab-connector-svg" style={svgStyle} viewBox={`0 0 ${STAGE_WIDTH} ${STAGE_HEIGHT}`}>
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
            ...rectStyle,
            left: RECT_SHAPE.x,
            top: RECT_SHAPE.y,
            width: RECT_SHAPE.width,
            height: RECT_SHAPE.height,
          }}
        />

        <div
          data-testid="lab-circle"
          onPointerDown={handleCirclePointerDown}
          onPointerMove={handleCirclePointerMove}
          onPointerUp={handleCirclePointerUp}
          style={{
            ...circleStyle,
            left: circle.x,
            top: circle.y,
            width: circle.width,
            height: circle.height,
          }}
        />

        <div style={statsStyle}>
          <div>
            to-anchor: <strong data-testid="to-anchor">{routeState.toAnchor}</strong>
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

const mainStyle = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  background: "#e5e7eb",
  padding: 24,
} as const;

const stageStyle = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  position: "relative",
  border: "1px solid #94a3b8",
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
  backgroundSize: "32px 32px",
} as const;

const svgStyle = {
  position: "absolute",
  inset: 0,
  overflow: "visible",
} as const;

const rectStyle = {
  position: "absolute",
  background: "#93c5fd",
  border: "2px solid #3b82f6",
  borderRadius: 4,
} as const;

const circleStyle = {
  position: "absolute",
  borderRadius: "50%",
  background: "#fca5a5",
  border: "2px solid #ef4444",
  cursor: "grab",
  touchAction: "none",
} as const;

const statsStyle = {
  position: "absolute",
  left: 12,
  top: 12,
  fontSize: 13,
  color: "#0f172a",
} as const;
