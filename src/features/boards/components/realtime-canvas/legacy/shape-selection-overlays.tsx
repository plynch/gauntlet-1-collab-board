import type { PointerEvent as ReactPointerEvent } from "react";

import type { BoardObject } from "@/features/boards/types";
import { getReadableTextColor } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  CORNER_HANDLES,
  getCornerCursor,
  getCornerPositionStyle,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { RESIZE_HANDLE_SIZE } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ResizeCorner } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type LineEndpointOffsets = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type ShapeSelectionOverlaysProps = {
  objectItem: BoardObject;
  objectLabelText: string;
  objectWidth: number;
  renderedObjectColor: string;
  resolvedTheme: "light" | "dark";
  isSingleSelected: boolean;
  canEdit: boolean;
  lineEndpointOffsets: LineEndpointOffsets | null;
  startShapeRotate: (objectId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  startCornerResize: (
    objectId: string,
    corner: ResizeCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startLineEndpointResize: (
    objectId: string,
    endpoint: "start" | "end",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function ShapeSelectionOverlays({
  objectItem,
  objectLabelText,
  objectWidth,
  renderedObjectColor,
  resolvedTheme,
  isSingleSelected,
  canEdit,
  lineEndpointOffsets,
  startShapeRotate,
  startCornerResize,
  startLineEndpointResize,
}: ShapeSelectionOverlaysProps) {
  return (
    <>
      {objectLabelText.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: objectItem.type === "triangle" ? "66%" : "50%",
            transform: "translate(-50%, -50%)",
            maxWidth:
              objectItem.type === "line"
                ? Math.max(120, objectWidth - 24)
                : objectItem.type === "triangle"
                  ? Math.max(96, objectWidth * 0.74)
                  : Math.max(76, objectWidth - 18),
            padding: objectItem.type === "line" ? "0.2rem 0.45rem" : "0.1rem 0.2rem",
            borderRadius: objectItem.type === "line" ? 8 : 6,
            border: objectItem.type === "line" ? "1px solid var(--border)" : "none",
            background: objectItem.type === "line" ? "var(--surface)" : "transparent",
            color:
              objectItem.type === "line"
                ? "var(--text)"
                : getReadableTextColor(renderedObjectColor),
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.25,
            textAlign: "center",
            textShadow:
              objectItem.type === "line"
                ? "none"
                : resolvedTheme === "dark"
                  ? "0 1px 2px rgba(2,6,23,0.55)"
                  : "0 1px 1px rgba(248,250,252,0.65)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
          title={objectLabelText}
        >
          {objectLabelText}
        </div>
      ) : null}

      {isSingleSelected && canEdit && objectItem.type !== "line" && objectItem.type !== "gridContainer" ? (
        <>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              width: 2,
              height: 16,
              background: "#93c5fd",
              transform: "translate(-50%, -102%)",
              pointerEvents: "none",
            }}
          />
          <button
            type="button"
            onPointerDown={(event) => startShapeRotate(objectItem.id, event)}
            aria-label="Rotate shape"
            title="Drag to rotate shape (hold Shift to snap)"
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              transform: "translate(-50%, -168%)",
              width: 14,
              height: 14,
              borderRadius: "50%",
              border: "1px solid #1d4ed8",
              background: "var(--surface)",
              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
              cursor: "grab",
            }}
          />
        </>
      ) : null}

      {isSingleSelected && canEdit && objectItem.type !== "line" ? (
        <div>
          {CORNER_HANDLES.map((corner) => (
            <button
              key={corner}
              type="button"
              onPointerDown={(event) => startCornerResize(objectItem.id, corner, event)}
              style={{
                position: "absolute",
                ...getCornerPositionStyle(corner),
                width: RESIZE_HANDLE_SIZE,
                height: RESIZE_HANDLE_SIZE,
                border: "1px solid #1d4ed8",
                borderRadius: 2,
                background: "var(--surface)",
                cursor: getCornerCursor(corner),
              }}
              aria-label={`Resize ${corner} corner`}
            />
          ))}
        </div>
      ) : null}

      {isSingleSelected && canEdit && objectItem.type === "line" && lineEndpointOffsets ? (
        <>
          <button
            type="button"
            onPointerDown={(event) => startLineEndpointResize(objectItem.id, "start", event)}
            aria-label="Adjust line start"
            style={{
              position: "absolute",
              left: lineEndpointOffsets.start.x - RESIZE_HANDLE_SIZE / 2,
              top: lineEndpointOffsets.start.y - RESIZE_HANDLE_SIZE / 2,
              width: RESIZE_HANDLE_SIZE,
              height: RESIZE_HANDLE_SIZE,
              borderRadius: "50%",
              border: "1px solid #1d4ed8",
              background: "var(--surface)",
              cursor: "move",
            }}
          />
          <button
            type="button"
            onPointerDown={(event) => startLineEndpointResize(objectItem.id, "end", event)}
            aria-label="Adjust line end"
            style={{
              position: "absolute",
              left: lineEndpointOffsets.end.x - RESIZE_HANDLE_SIZE / 2,
              top: lineEndpointOffsets.end.y - RESIZE_HANDLE_SIZE / 2,
              width: RESIZE_HANDLE_SIZE,
              height: RESIZE_HANDLE_SIZE,
              borderRadius: "50%",
              border: "1px solid #1d4ed8",
              background: "var(--surface)",
              cursor: "move",
            }}
          />
        </>
      ) : null}
    </>
  );
}
