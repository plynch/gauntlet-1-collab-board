import { RemoteCursorLayer } from "@/features/boards/components/realtime-canvas/render-primitives";

type AnchorPoint = {
  objectId: string;
  anchor: string;
  x: number;
  y: number;
};

type MarqueeRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type StageOverlaysProps = {
  shouldShowConnectorAnchors: boolean;
  connectorAnchorPoints: AnchorPoint[];
  marqueeRect: MarqueeRect | null;
  viewport: Parameters<typeof RemoteCursorLayer>[0]["viewport"];
  remoteCursors: Parameters<typeof RemoteCursorLayer>[0]["remoteCursors"];
  fps: number;
  fpsTone: string;
  fpsTarget: number;
};

export function StageOverlays({
  shouldShowConnectorAnchors,
  connectorAnchorPoints,
  marqueeRect,
  viewport,
  remoteCursors,
  fps,
  fpsTone,
  fpsTarget,
}: StageOverlaysProps) {
  return (
    <>
      {shouldShowConnectorAnchors
        ? connectorAnchorPoints.map((anchorPoint) => (
            <span
              key={`${anchorPoint.objectId}-${anchorPoint.anchor}`}
              style={{
                position: "absolute",
                left: viewport.x + anchorPoint.x * viewport.scale - 4,
                top: viewport.y + anchorPoint.y * viewport.scale - 4,
                width: 8,
                height: 8,
                borderRadius: "50%",
                border: "1px solid var(--border-strong)",
                background: "var(--surface)",
                pointerEvents: "none",
                zIndex: 38,
              }}
            />
          ))
        : null}

      {marqueeRect ? (
        <div
          style={{
            position: "absolute",
            left: viewport.x + marqueeRect.left * viewport.scale,
            top: viewport.y + marqueeRect.top * viewport.scale,
            width: Math.max(1, (marqueeRect.right - marqueeRect.left) * viewport.scale),
            height: Math.max(1, (marqueeRect.bottom - marqueeRect.top) * viewport.scale),
            border: "1px solid rgba(37, 99, 235, 0.95)",
            background: "rgba(59, 130, 246, 0.16)",
            pointerEvents: "none",
            zIndex: 40,
          }}
        />
      ) : null}

      <RemoteCursorLayer remoteCursors={remoteCursors} viewport={viewport} />
      <div
        style={{
          position: "absolute",
          right: 12,
          bottom: 12,
          zIndex: 60,
          pointerEvents: "none",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "color-mix(in oklab, var(--surface) 90%, transparent)",
          color: "var(--text-muted)",
          padding: "0.2rem 0.45rem",
          fontSize: 11,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.35rem",
          boxShadow: "0 2px 8px rgba(2, 6, 23, 0.16)",
        }}
        aria-hidden="true"
      >
        <span style={{ color: fpsTone }}>{fps} FPS</span>
        <span style={{ color: "var(--text-muted)" }}>/ {fpsTarget}</span>
      </div>
    </>
  );
}
