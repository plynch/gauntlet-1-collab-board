import type { PointerEvent as ReactPointerEvent } from "react";

import type { BoardObject } from "@/features/boards/types";
import {
  SELECTED_OBJECT_HALO,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { GridContainerContentDraft } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { GridContainerObjectContent } from "@/features/boards/components/realtime-canvas/legacy/grid-container-object-content";
import { ShapeSelectionOverlays } from "@/features/boards/components/realtime-canvas/legacy/shape-selection-overlays";

type LineEndpointOffsets = {
  start: { x: number; y: number };
  end: { x: number; y: number };
};

type ShapeObjectArticleProps = {
  objectItem: BoardObject;
  objectX: number;
  objectY: number;
  objectWidth: number;
  objectHeight: number;
  objectRotationDeg: number;
  hasDraftGeometry: boolean;
  renderedObjectColor: string;
  objectSurfaceColor: string;
  objectLabelText: string;
  isSelected: boolean;
  isSingleSelected: boolean;
  canEdit: boolean;
  isObjectDragging: boolean;
  resolvedTheme: "light" | "dark";
  lineEndpointOffsets: LineEndpointOffsets | null;
  isPolygonShape: boolean;
  isGridContainer: boolean;
  gridRows: number;
  gridCols: number;
  gridGap: number;
  gridTotalCells: number;
  gridCellColors: string[];
  gridContainerTitle: string;
  gridSectionTitles: string[];
  shouldPreserveGroupSelection: (objectId: string) => boolean;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  startObjectDrag: (
    objectId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
  startShapeRotate: (
    objectId: string,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startCornerResize: (
    objectId: string,
    corner: "nw" | "ne" | "sw" | "se",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startLineEndpointResize: (
    objectId: string,
    endpoint: "start" | "end",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  updateGridContainerDimensions: (
    objectId: string,
    nextRows: number,
    nextCols: number,
  ) => Promise<void>;
  getGridDraftForObject: (objectItem: BoardObject) => GridContainerContentDraft;
  queueGridContentSync: (
    objectId: string,
    draft: GridContainerContentDraft,
    options?: { immediate?: boolean },
  ) => void;
  saveGridContainerCellColors: (objectId: string, nextColors: string[]) => void;
};

export function ShapeObjectArticle({
  objectItem,
  objectX,
  objectY,
  objectWidth,
  objectHeight,
  objectRotationDeg,
  hasDraftGeometry,
  renderedObjectColor,
  objectSurfaceColor,
  objectLabelText,
  isSelected,
  isSingleSelected,
  canEdit,
  isObjectDragging,
  resolvedTheme,
  lineEndpointOffsets,
  isPolygonShape,
  isGridContainer,
  gridRows,
  gridCols,
  gridGap,
  gridTotalCells,
  gridCellColors,
  gridContainerTitle,
  gridSectionTitles,
  shouldPreserveGroupSelection,
  selectSingleObject,
  toggleObjectSelection,
  startObjectDrag,
  startShapeRotate,
  startCornerResize,
  startLineEndpointResize,
  updateGridContainerDimensions,
  getGridDraftForObject,
  queueGridContentSync,
  saveGridContainerCellColors,
}: ShapeObjectArticleProps) {
  const isFreeFrame =
    objectItem.type === "rect" && objectItem.containerTitle === "__frame__";

  return (
    <article
      data-board-object="true"
      onPointerDown={
        isFreeFrame
          ? undefined
          : (event) => {
              event.stopPropagation();
              if (event.shiftKey) {
                toggleObjectSelection(objectItem.id);
                return;
              }

              if (shouldPreserveGroupSelection(objectItem.id)) {
                return;
              }
              selectSingleObject(objectItem.id);
            }
      }
      style={{
        position: "absolute",
        left: objectX,
        top: objectY,
        width: objectWidth,
        height: objectHeight,
        zIndex: 0,
        isolation: "isolate",
        overflow: "visible",
        boxShadow:
          isSelected && objectItem.type !== "line" ? SELECTED_OBJECT_HALO : "none",
        borderRadius:
          objectItem.type === "circle"
            ? "999px"
            : objectItem.type === "line" ||
                objectItem.type === "gridContainer" ||
                objectItem.type === "triangle" ||
                objectItem.type === "star"
              ? 0
              : 4,
        transform:
          objectItem.type === "line" || objectItem.type === "gridContainer"
            ? "none"
            : `rotate(${objectRotationDeg}deg)`,
        transformOrigin: "center center",
        pointerEvents: isFreeFrame ? "none" : "auto",
        transition: hasDraftGeometry
          ? "none"
          : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear",
      }}
    >
      <div
        onPointerDown={
          isFreeFrame ? undefined : (event) => startObjectDrag(objectItem.id, event)
        }
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: canEdit ? (isObjectDragging ? "grabbing" : "grab") : "default",
          border:
            objectItem.type === "line" || isPolygonShape || isGridContainer
              ? "none"
              : `2px solid ${objectSurfaceColor}`,
          borderRadius:
            objectItem.type === "rect"
              ? 3
              : objectItem.type === "circle"
                ? "999px"
                : 0,
          background:
            objectItem.type === "line" || isPolygonShape || isGridContainer
              ? "transparent"
              : renderedObjectColor,
          boxShadow:
            objectItem.type === "line" || isPolygonShape || isGridContainer
              ? "none"
              : "0 3px 10px rgba(0,0,0,0.08)",
          pointerEvents: isFreeFrame ? "none" : "auto",
        }}
      >
        {isFreeFrame ? (
          <svg
            viewBox="0 0 100 100"
            width="100%"
            height="100%"
            aria-hidden="true"
            style={{ display: "block", overflow: "visible", pointerEvents: "auto" }}
          >
            <rect
              x="1"
              y="1"
              width="98"
              height="98"
              fill="transparent"
              stroke={renderedObjectColor}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              pointerEvents="stroke"
              style={{ cursor: canEdit ? (isObjectDragging ? "grabbing" : "grab") : "default" }}
              onPointerDown={(event) =>
                startObjectDrag(
                  objectItem.id,
                  event as unknown as ReactPointerEvent<HTMLElement>,
                )
              }
            />
          </svg>
        ) : objectItem.type === "line" ? (
          <div
            style={{
              width: "100%",
              height: 4,
              borderRadius: 999,
              background: renderedObjectColor,
              transform: `rotate(${objectRotationDeg}deg)`,
              transformOrigin: "center center",
            }}
          />
        ) : objectItem.type === "triangle" ? (
          <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
            <polygon
              points="50,6 94,92 6,92"
              fill={renderedObjectColor}
              stroke={resolvedTheme === "dark" ? "rgba(241, 245, 249, 0.72)" : "rgba(15, 23, 42, 0.62)"}
              strokeWidth="5"
              strokeLinejoin="round"
            />
          </svg>
        ) : objectItem.type === "star" ? (
          <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true" style={{ display: "block" }}>
            <polygon
              points="50,7 61,38 95,38 67,57 78,90 50,70 22,90 33,57 5,38 39,38"
              fill={renderedObjectColor}
              stroke={resolvedTheme === "dark" ? "rgba(241, 245, 249, 0.72)" : "rgba(15, 23, 42, 0.62)"}
              strokeWidth="5"
              strokeLinejoin="round"
            />
          </svg>
        ) : objectItem.type === "gridContainer" ? (
          <GridContainerObjectContent
            objectItem={objectItem}
            gridRows={gridRows}
            gridCols={gridCols}
            gridGap={gridGap}
            gridTotalCells={gridTotalCells}
            gridCellColors={gridCellColors}
            gridContainerTitle={gridContainerTitle}
            gridSectionTitles={gridSectionTitles}
            renderedObjectColor={renderedObjectColor}
            resolvedTheme={resolvedTheme}
            isSingleSelected={isSingleSelected}
            canEdit={canEdit}
            updateGridContainerDimensions={updateGridContainerDimensions}
            getGridDraftForObject={getGridDraftForObject}
            queueGridContentSync={queueGridContentSync}
            saveGridContainerCellColors={saveGridContainerCellColors}
          />
        ) : null}
      </div>

      <ShapeSelectionOverlays
        objectItem={objectItem}
        objectLabelText={objectLabelText}
        objectWidth={objectWidth}
        renderedObjectColor={renderedObjectColor}
        resolvedTheme={resolvedTheme}
        isFrame={isFreeFrame}
        isSingleSelected={isSingleSelected}
        canEdit={canEdit}
        lineEndpointOffsets={lineEndpointOffsets}
        startShapeRotate={startShapeRotate}
        startCornerResize={startCornerResize}
        startLineEndpointResize={startLineEndpointResize}
      />
    </article>
  );
}
