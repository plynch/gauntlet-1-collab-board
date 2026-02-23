import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type { BoardObject } from "@/features/boards/types";
import { ConnectorObjectArticle } from "@/features/boards/components/realtime-canvas/legacy/connector-object-article";
import type { ConnectorRouteResult } from "@/features/boards/components/realtime-canvas/legacy/connector-route-runtime";
import { ShapeObjectArticle } from "@/features/boards/components/realtime-canvas/legacy/shape-object-article";
import {
  deriveStageObjectRenderData,
} from "@/features/boards/components/realtime-canvas/legacy/stage-object-layer-derive";
import { StickyObjectArticle } from "@/features/boards/components/realtime-canvas/legacy/sticky-object-article";
import { TextObjectArticle } from "@/features/boards/components/realtime-canvas/legacy/text-object-article";
import type {
  GridContainerContentDraft,
  ObjectGeometry,
  StickyTextHoldDragState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type StageObjectLayerProps = {
  objects: BoardObject[];
  viewportX: number;
  viewportY: number;
  viewportScale: number;
  draftGeometryById: Record<string, ObjectGeometry>;
  textDrafts: Record<string, string>;
  selectedObjectIds: string[];
  connectorRoutesById: Map<string, ConnectorRouteResult>;
  resolvedTheme: "light" | "dark";
  canEdit: boolean;
  isObjectDragging: boolean;
  connectorEndpointDragObjectId: string | null;
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
  startConnectorEndpointDrag: (
    objectId: string,
    endpoint: "from" | "to",
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
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  clearStickyTextHoldDrag: () => void;
  setTextDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  queueStickyTextSync: (objectId: string, nextText: string) => void;
  flushStickyTextSync: (objectId: string) => void;
};

export function StageObjectLayer({
  objects,
  viewportX,
  viewportY,
  viewportScale,
  draftGeometryById,
  textDrafts,
  selectedObjectIds,
  connectorRoutesById,
  resolvedTheme,
  canEdit,
  isObjectDragging,
  connectorEndpointDragObjectId,
  shouldPreserveGroupSelection,
  selectSingleObject,
  toggleObjectSelection,
  startObjectDrag,
  startShapeRotate,
  startCornerResize,
  startLineEndpointResize,
  startConnectorEndpointDrag,
  updateGridContainerDimensions,
  getGridDraftForObject,
  queueGridContentSync,
  saveGridContainerCellColors,
  stickyTextHoldDragRef,
  clearStickyTextHoldDrag,
  setTextDrafts,
  queueStickyTextSync,
  flushStickyTextSync,
}: StageObjectLayerProps) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 1,
        transform: `translate(${viewportX}px, ${viewportY}px) scale(${viewportScale})`,
        transformOrigin: "0 0",
      }}
    >
      {objects.map((objectItem) => {
        const renderData = deriveStageObjectRenderData({
          objectItem,
          draftGeometryById,
          textDrafts,
          selectedObjectIds,
          connectorRoutesById,
          resolvedTheme,
          getGridDraftForObject,
        });

        if (renderData.isConnector && renderData.connectorRoute && renderData.connectorFrame) {
          return (
            <ConnectorObjectArticle
              key={objectItem.id}
              objectItem={objectItem}
              connectorRoute={renderData.connectorRoute}
              connectorFrame={renderData.connectorFrame}
              renderedObjectColor={renderData.renderedObjectColor}
              objectLabelText={renderData.objectLabelText}
              isSelected={renderData.isSelected}
              isSingleSelected={renderData.isSingleSelected}
              canEdit={canEdit}
              isEndpointDragActive={connectorEndpointDragObjectId === objectItem.id}
              shouldPreserveGroupSelection={shouldPreserveGroupSelection}
              selectSingleObject={selectSingleObject}
              toggleObjectSelection={toggleObjectSelection}
              startConnectorEndpointDrag={startConnectorEndpointDrag}
            />
          );
        }

        if (objectItem.type === "sticky") {
          return (
            <StickyObjectArticle
              key={objectItem.id}
              objectItem={objectItem}
              objectX={renderData.objectX}
              objectY={renderData.objectY}
              objectWidth={renderData.objectWidth}
              objectHeight={renderData.objectHeight}
              objectRotationDeg={renderData.objectRotationDeg}
              objectText={renderData.objectText}
              objectTextColor={renderData.objectTextColor}
              renderedObjectColor={renderData.renderedObjectColor}
              isSelected={renderData.isSelected}
              isSingleSelected={renderData.isSingleSelected}
              hasDraftGeometry={renderData.hasDraftGeometry}
              canEdit={canEdit}
              isObjectDragging={isObjectDragging}
              shouldPreserveGroupSelection={shouldPreserveGroupSelection}
              selectSingleObject={selectSingleObject}
              toggleObjectSelection={toggleObjectSelection}
              startObjectDrag={startObjectDrag}
              startCornerResize={startCornerResize}
              startShapeRotate={startShapeRotate}
              stickyTextHoldDragRef={stickyTextHoldDragRef}
              clearStickyTextHoldDrag={clearStickyTextHoldDrag}
              setTextDrafts={setTextDrafts}
              queueStickyTextSync={queueStickyTextSync}
              flushStickyTextSync={flushStickyTextSync}
            />
          );
        }

        if (objectItem.type === "text") {
          return (
            <TextObjectArticle
              key={objectItem.id}
              objectItem={objectItem}
              objectX={renderData.objectX}
              objectY={renderData.objectY}
              objectWidth={renderData.objectWidth}
              objectHeight={renderData.objectHeight}
              objectRotationDeg={renderData.objectRotationDeg}
              objectText={renderData.objectText}
              renderedObjectColor={renderData.renderedObjectColor}
              isSelected={renderData.isSelected}
              isSingleSelected={renderData.isSingleSelected}
              hasDraftGeometry={renderData.hasDraftGeometry}
              canEdit={canEdit}
              isObjectDragging={isObjectDragging}
              shouldPreserveGroupSelection={shouldPreserveGroupSelection}
              selectSingleObject={selectSingleObject}
              toggleObjectSelection={toggleObjectSelection}
              startObjectDrag={startObjectDrag}
              startCornerResize={startCornerResize}
              startShapeRotate={startShapeRotate}
              stickyTextHoldDragRef={stickyTextHoldDragRef}
              clearStickyTextHoldDrag={clearStickyTextHoldDrag}
              setTextDrafts={setTextDrafts}
              queueStickyTextSync={queueStickyTextSync}
              flushStickyTextSync={flushStickyTextSync}
            />
          );
        }

        return (
          <ShapeObjectArticle
            key={objectItem.id}
            objectItem={objectItem}
            objectX={renderData.objectX}
            objectY={renderData.objectY}
            objectWidth={renderData.objectWidth}
            objectHeight={renderData.objectHeight}
            objectRotationDeg={renderData.objectRotationDeg}
            hasDraftGeometry={renderData.hasDraftGeometry}
            renderedObjectColor={renderData.renderedObjectColor}
            objectSurfaceColor={renderData.objectSurfaceColor}
            objectLabelText={renderData.objectLabelText}
            isSelected={renderData.isSelected}
            isSingleSelected={renderData.isSingleSelected}
            canEdit={canEdit}
            isObjectDragging={isObjectDragging}
            resolvedTheme={resolvedTheme}
            lineEndpointOffsets={renderData.lineEndpointOffsets}
            isPolygonShape={renderData.isPolygonShape}
            isGridContainer={renderData.isGridContainer}
            gridRows={renderData.gridRows}
            gridCols={renderData.gridCols}
            gridGap={renderData.gridGap}
            gridTotalCells={renderData.gridTotalCells}
            gridCellColors={renderData.gridCellColors}
            gridContainerTitle={renderData.gridContainerTitle}
            gridSectionTitles={renderData.gridSectionTitles}
            shouldPreserveGroupSelection={shouldPreserveGroupSelection}
            selectSingleObject={selectSingleObject}
            toggleObjectSelection={toggleObjectSelection}
            startObjectDrag={startObjectDrag}
            startShapeRotate={startShapeRotate}
            startCornerResize={startCornerResize}
            startLineEndpointResize={startLineEndpointResize}
            updateGridContainerDimensions={updateGridContainerDimensions}
            getGridDraftForObject={getGridDraftForObject}
            queueGridContentSync={queueGridContentSync}
            saveGridContainerCellColors={saveGridContainerCellColors}
          />
        );
      })}
    </div>
  );
}
