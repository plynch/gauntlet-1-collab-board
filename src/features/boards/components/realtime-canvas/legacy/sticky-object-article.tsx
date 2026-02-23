import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  PointerEvent as ReactPointerEvent,
} from "react";

import type { BoardObject } from "@/features/boards/types";
import {
  CORNER_HANDLES,
  getCornerCursor,
  getCornerPositionStyle,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  RESIZE_HANDLE_SIZE,
  SELECTED_OBJECT_HALO,
  STICKY_TEXT_HOLD_DRAG_DELAY_MS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  continueTextHoldDrag,
  startTextHoldDrag,
} from "@/features/boards/components/realtime-canvas/legacy/editable-text-hold-drag";
import type {
  ResizeCorner,
  StickyTextHoldDragState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type StickyObjectArticleProps = {
  objectItem: BoardObject;
  objectX: number;
  objectY: number;
  objectWidth: number;
  objectHeight: number;
  objectRotationDeg: number;
  objectText: string;
  objectTextColor: string;
  renderedObjectColor: string;
  isSelected: boolean;
  isSingleSelected: boolean;
  hasDraftGeometry: boolean;
  canEdit: boolean;
  isObjectDragging: boolean;
  shouldPreserveGroupSelection: (objectId: string) => boolean;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  startObjectDrag: (
    objectId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  startCornerResize: (
    objectId: string,
    corner: ResizeCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startShapeRotate: (
    objectId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  clearStickyTextHoldDrag: () => void;
  setTextDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  queueStickyTextSync: (objectId: string, nextText: string) => void;
  flushStickyTextSync: (objectId: string) => void;
};

export function StickyObjectArticle({
  objectItem,
  objectX,
  objectY,
  objectWidth,
  objectHeight,
  objectRotationDeg,
  objectText,
  objectTextColor,
  renderedObjectColor,
  isSelected,
  isSingleSelected,
  hasDraftGeometry,
  canEdit,
  isObjectDragging,
  shouldPreserveGroupSelection,
  selectSingleObject,
  toggleObjectSelection,
  startObjectDrag,
  startCornerResize,
  startShapeRotate,
  stickyTextHoldDragRef,
  clearStickyTextHoldDrag,
  setTextDrafts,
  queueStickyTextSync,
  flushStickyTextSync,
}: StickyObjectArticleProps) {
  if (objectItem.type !== "sticky") {
    return null;
  }

  return (
    <article
      data-board-object="true"
      onPointerDown={(event) => {
        event.stopPropagation();
        if (event.shiftKey) {
          toggleObjectSelection(objectItem.id);
          return;
        }

        if (shouldPreserveGroupSelection(objectItem.id)) {
          return;
        }
        selectSingleObject(objectItem.id);
      }}
      style={{
        position: "absolute",
        left: objectX,
        top: objectY,
        width: objectWidth,
        height: objectHeight,
        zIndex: 0,
        isolation: "isolate",
        borderRadius: 10,
        border: isSelected
          ? "2px solid #2563eb"
          : "1px solid rgba(15, 23, 42, 0.28)",
        background: renderedObjectColor,
        boxShadow: isSelected ? SELECTED_OBJECT_HALO : "0 4px 12px rgba(0,0,0,0.08)",
        overflow: "visible",
        transform: `rotate(${objectRotationDeg}deg)`,
        transformOrigin: "center center",
        transition: hasDraftGeometry
          ? "none"
          : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear",
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }}>
        <header
          onPointerDown={(event) => startObjectDrag(objectItem.id, event)}
          style={{
            height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: "0.35rem",
            padding: "0 0.5rem",
            background: "rgba(0,0,0,0.08)",
            cursor: canEdit ? (isObjectDragging ? "grabbing" : "grab") : "default",
          }}
        />

        <textarea
          value={objectText}
          onPointerDown={(event) => {
            event.stopPropagation();
            if (event.shiftKey) {
              toggleObjectSelection(objectItem.id);
              clearStickyTextHoldDrag();
              return;
            }
            if (!shouldPreserveGroupSelection(objectItem.id)) {
              selectSingleObject(objectItem.id);
            }

            startTextHoldDrag({
              objectId: objectItem.id,
              canEdit,
              delayMs: STICKY_TEXT_HOLD_DRAG_DELAY_MS,
              startObjectDrag,
              clearStickyTextHoldDrag,
              stickyTextHoldDragRef,
              event,
            });
          }}
          onPointerMove={(event) => {
            continueTextHoldDrag({
              objectId: objectItem.id,
              canEdit,
              startObjectDrag,
              clearStickyTextHoldDrag,
              stickyTextHoldDragRef,
              event,
            });
          }}
          onPointerUp={clearStickyTextHoldDrag}
          onPointerCancel={clearStickyTextHoldDrag}
          onFocus={() => {
            if (!shouldPreserveGroupSelection(objectItem.id)) {
              selectSingleObject(objectItem.id);
            }
          }}
          onChange={(event) => {
            const nextText = event.target.value.slice(0, 1_000);
            setTextDrafts((previous) => ({ ...previous, [objectItem.id]: nextText }));
            queueStickyTextSync(objectItem.id, nextText);
          }}
          onBlur={(event) => {
            clearStickyTextHoldDrag();
            const nextText = event.target.value;
            setTextDrafts((previous) => {
              const next = { ...previous };
              delete next[objectItem.id];
              return next;
            });
            queueStickyTextSync(objectItem.id, nextText);
            flushStickyTextSync(objectItem.id);
          }}
          readOnly={!canEdit}
          style={{
            width: "100%",
            height: objectHeight - 28,
            border: "none",
            resize: "none",
            padding: "0.5rem",
            background: "transparent",
            color: objectTextColor,
            fontSize: 14,
            outline: "none",
            cursor: canEdit ? (isObjectDragging ? "grabbing" : "grab") : "default",
          }}
        />
      </div>

      {isSingleSelected && canEdit ? (
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

      {isSingleSelected && canEdit ? (
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
            aria-label="Rotate note"
            title="Drag to rotate note (hold Shift to snap)"
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
    </article>
  );
}
