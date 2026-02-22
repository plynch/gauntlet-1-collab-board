type AxisLabel = {
  value: number;
  screen: number;
};

type StageAxisOverlayProps = {
  stageWidth: number;
  stageHeight: number;
  viewportX: number;
  viewportY: number;
  xLabels: AxisLabel[];
  yLabels: AxisLabel[];
};

export function StageAxisOverlay({
  stageWidth,
  stageHeight,
  viewportX,
  viewportY,
  xLabels,
  yLabels,
}: StageAxisOverlayProps) {
  return (
    <>
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 0,
          overflow: "hidden",
        }}
      >
        {viewportX >= -1 && viewportX <= stageWidth + 1 ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: Math.round(viewportX),
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(244, 114, 182, 0.55)",
            }}
          />
        ) : null}
        {viewportY >= -1 && viewportY <= stageHeight + 1 ? (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: Math.round(viewportY),
              height: 1,
              background: "rgba(244, 114, 182, 0.55)",
            }}
          />
        ) : null}
      </div>

      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          zIndex: 6,
          overflow: "hidden",
        }}
      >
        {xLabels.map((label) => (
          <span
            key={`x-${label.value}`}
            style={{
              position: "absolute",
              left: Math.round(label.screen) + 3,
              top: 4,
              padding: "0 3px",
              borderRadius: 4,
              background: "var(--canvas-axis-label-bg)",
              color: "var(--canvas-axis-label-text)",
              fontSize: 10,
              lineHeight: 1.35,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {label.value}
          </span>
        ))}
        {yLabels.map((label) => (
          <span
            key={`y-${label.value}`}
            style={{
              position: "absolute",
              left: 4,
              top: Math.round(label.screen) + 3,
              padding: "0 3px",
              borderRadius: 4,
              background: "var(--canvas-axis-label-bg)",
              color: "var(--canvas-axis-label-text)",
              fontSize: 10,
              lineHeight: 1.35,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {label.value}
          </span>
        ))}
      </div>
    </>
  );
}
