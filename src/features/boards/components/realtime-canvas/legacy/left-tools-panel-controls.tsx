"use client";

type LeftToolsPanelControlsProps = {
  zoomSliderMin: number;
  zoomSliderMax: number;
  zoomSliderValue: number;
  zoomPercent: number;
  selectedObjectCount: number;
  isSnapToGridEnabled: boolean;
  cursorBoardPosition: { x: number; y: number } | null;
  boardError: string | null;
  boardStatusMessage: string | null;
  onResetView: () => void;
  onNudgeZoomOut: () => void;
  onNudgeZoomIn: () => void;
  onZoomSliderChange: (nextScale: number) => void;
  onSnapToGridToggle: (nextEnabled: boolean) => void;
};

export function LeftToolsPanelControls({
  zoomSliderMin,
  zoomSliderMax,
  zoomSliderValue,
  zoomPercent,
  selectedObjectCount,
  isSnapToGridEnabled,
  cursorBoardPosition,
  boardError,
  boardStatusMessage,
  onResetView,
  onNudgeZoomOut,
  onNudgeZoomIn,
  onZoomSliderChange,
  onSnapToGridToggle,
}: LeftToolsPanelControlsProps) {
  return (
    <>
      <button
        type="button"
        onClick={onResetView}
        style={{
          width: "100%",
          height: 32,
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          fontSize: 12,
        }}
      >
        Reset view
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "22px minmax(0, 1fr) 22px auto",
          alignItems: "center",
          gap: "0.35rem",
          width: "100%",
          padding: "0.2rem 0.35rem",
          border: "1px solid var(--border)",
          borderRadius: 10,
          background: "var(--surface)",
        }}
      >
        <button
          type="button"
          onClick={onNudgeZoomOut}
          title="Zoom out"
          aria-label="Zoom out"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-muted)",
            lineHeight: 1,
            padding: 0,
          }}
        >
          −
        </button>
        <input
          type="range"
          min={zoomSliderMin}
          max={zoomSliderMax}
          step={1}
          value={zoomSliderValue}
          onChange={(event) => {
            const nextScale = Number(event.target.value) / 100;
            onZoomSliderChange(nextScale);
          }}
          aria-label="Zoom level"
          style={{
            width: "100%",
            minWidth: 0,
            accentColor: "#2563eb",
          }}
        />
        <button
          type="button"
          onClick={onNudgeZoomIn}
          title="Zoom in"
          aria-label="Zoom in"
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-muted)",
            lineHeight: 1,
            padding: 0,
          }}
        >
          +
        </button>
        <span
          style={{
            color: "var(--text-muted)",
            fontSize: 11,
            minWidth: 34,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {zoomPercent}%
        </span>
      </div>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.5rem",
          width: "100%",
          padding: "0.45rem 0.55rem",
          border: "1px solid var(--border)",
          borderRadius: 8,
          background: "var(--surface)",
          color: "var(--text-muted)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          userSelect: "none",
        }}
      >
        <input
          type="checkbox"
          checked={isSnapToGridEnabled}
          onChange={(event) => onSnapToGridToggle(event.target.checked)}
          style={{
            width: 14,
            height: 14,
            accentColor: "#2563eb",
            cursor: "pointer",
          }}
        />
        <span>Snap to grid</span>
      </label>

      <span
        style={{
          color:
            selectedObjectCount > 0 ? "var(--text)" : "var(--text-muted)",
          fontSize: 12,
          lineHeight: 1.25,
          wordBreak: "break-word",
        }}
      >
        Selected:{" "}
        {selectedObjectCount > 0
          ? `${selectedObjectCount} object${selectedObjectCount === 1 ? "" : "s"}`
          : "None"}
      </span>

      <span
        style={{
          color: cursorBoardPosition ? "var(--text)" : "var(--text-muted)",
          fontSize: 12,
          lineHeight: 1.25,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        Cursor:{" "}
        {cursorBoardPosition
          ? `${cursorBoardPosition.x}, ${cursorBoardPosition.y}`
          : "—"}
      </span>

      {boardError ? (
        <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>
          {boardError}
        </p>
      ) : null}
      {boardStatusMessage ? (
        <p
          style={{
            color: "var(--text)",
            margin: 0,
            fontSize: 12,
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.4rem 0.5rem",
            background: "var(--surface-muted)",
          }}
        >
          {boardStatusMessage}
        </p>
      ) : null}
    </>
  );
}
