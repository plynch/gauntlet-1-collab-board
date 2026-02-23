import type {
  Dispatch,
  MutableRefObject,
  WheelEvent as ReactWheelEvent,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type { BoardObject, PresenceUser } from "@/features/boards/types";
import { GRID_CELL_SIZE } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  BOARD_GRID_MAJOR_LINE_COLOR,
  BOARD_GRID_MINOR_LINE_COLOR,
  BOARD_GRID_SUPER_MAJOR_LINE_COLOR,
  GRID_MAJOR_SPACING,
  GRID_SUPER_MAJOR_SPACING,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ConnectorRouteResult } from "@/features/boards/components/realtime-canvas/legacy/connector-route-runtime";
import { SelectionHudPanel } from "@/features/boards/components/realtime-canvas/legacy/selection-hud-panel";
import { StageAxisOverlay } from "@/features/boards/components/realtime-canvas/legacy/stage-axis-overlay";
import { StageObjectLayer } from "@/features/boards/components/realtime-canvas/legacy/stage-object-layer";
import { StageOverlays } from "@/features/boards/components/realtime-canvas/legacy/stage-overlays";
import type {
  GridContainerContentDraft,
  ObjectGeometry,
  StickyTextHoldDragState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type StageSurfaceProps = {
  stageRef: MutableRefObject<HTMLDivElement | null>;
  selectionHudRef: MutableRefObject<HTMLDivElement | null>;
  stageSize: { width: number; height: number };
  viewport: ViewportState;
  gridAxisLabels: {
    xLabels: Array<{ screen: number; value: number }>;
    yLabels: Array<{ screen: number; value: number }>;
  };
  canEdit: boolean;
  isObjectDragging: boolean;
  objects: BoardObject[];
  draftGeometryById: Record<string, ObjectGeometry>;
  textDrafts: Record<string, string>;
  selectedObjectIds: string[];
  connectorRoutesById: Map<string, ConnectorRouteResult>;
  resolvedTheme: "light" | "dark";
  connectorEndpointDragObjectId: string | null;
  shouldShowConnectorAnchors: boolean;
  connectorAnchorPoints: Array<{ objectId: string; anchor: string; x: number; y: number }>;
  marqueeRect: { left: number; right: number; top: number; bottom: number } | null;
  remoteCursors: PresenceUser[];
  fps: number;
  fpsTone: string;
  fpsTarget: number;
  canShowSelectionHud: boolean;
  selectionHudPosition: { x: number; y: number } | null;
  canColorSelection: boolean;
  selectedColor: string | null;
  canResetSelectionRotation: boolean;
  canEditSelectedLabel: boolean;
  selectionLabelDraft: string;
  singleSelectedObject: BoardObject | null;
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  handleStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
  setSelectionLabelDraft: Dispatch<SetStateAction<string>>;
  saveSelectedObjectsColor: (color: string) => Promise<void>;
  resetSelectedObjectsRotation: () => Promise<void>;
  commitSelectionLabelDraft: () => Promise<void>;
  persistObjectLabelText: (objectId: string, nextText: string) => Promise<void>;
  shouldPreserveGroupSelection: (objectId: string) => boolean;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  startObjectDrag: (objectId: string, event: ReactPointerEvent<HTMLElement>) => void;
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
  clearStickyTextHoldDrag: () => void;
  setTextDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  queueStickyTextSync: (objectId: string, nextText: string) => void;
  flushStickyTextSync: (objectId: string) => void;
  handleWheel: (event: ReactWheelEvent<HTMLDivElement>) => void;
  onWheelCapture?: (event: ReactWheelEvent<HTMLDivElement>) => void;
};

export function StageSurface(props: StageSurfaceProps) {
  const {
    stageRef,
    selectionHudRef,
    stageSize,
    viewport,
    gridAxisLabels,
    canEdit,
    isObjectDragging,
    objects,
    draftGeometryById,
    textDrafts,
    selectedObjectIds,
    connectorRoutesById,
    resolvedTheme,
    connectorEndpointDragObjectId,
    shouldShowConnectorAnchors,
    connectorAnchorPoints,
    marqueeRect,
    remoteCursors,
    fps,
    fpsTone,
    fpsTarget,
    canShowSelectionHud,
    selectionHudPosition,
    canColorSelection,
    selectedColor,
    canResetSelectionRotation,
    canEditSelectedLabel,
    selectionLabelDraft,
    singleSelectedObject,
    stickyTextHoldDragRef,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    setSelectionLabelDraft,
    saveSelectedObjectsColor,
    resetSelectedObjectsRotation,
    commitSelectionLabelDraft,
    persistObjectLabelText,
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
    clearStickyTextHoldDrag,
    setTextDrafts,
    queueStickyTextSync,
    flushStickyTextSync,
    handleWheel,
    onWheelCapture,
  } = props;

  return (
    <div
      ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerLeave={handleStagePointerLeave}
        onWheelCapture={(event) => {
          onWheelCapture?.(event);
        }}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
        style={{
        position: "relative",
        width: "100%",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
        backgroundColor: "var(--canvas-bg)",
        backgroundImage: `linear-gradient(${BOARD_GRID_SUPER_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_SUPER_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(${BOARD_GRID_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(${BOARD_GRID_MINOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_MINOR_LINE_COLOR} 1px, transparent 1px)`,
        backgroundSize: `${GRID_SUPER_MAJOR_SPACING * viewport.scale}px ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px, ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px, ${GRID_MAJOR_SPACING * viewport.scale}px ${GRID_MAJOR_SPACING * viewport.scale}px, ${GRID_MAJOR_SPACING * viewport.scale}px ${GRID_MAJOR_SPACING * viewport.scale}px, ${GRID_CELL_SIZE * viewport.scale}px ${GRID_CELL_SIZE * viewport.scale}px, ${GRID_CELL_SIZE * viewport.scale}px ${GRID_CELL_SIZE * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
        touchAction: "none",
        overscrollBehavior: "none",
        overscrollBehaviorX: "none",
      }}
    >
      <StageAxisOverlay
        stageWidth={stageSize.width}
        stageHeight={stageSize.height}
        viewportX={viewport.x}
        viewportY={viewport.y}
        xLabels={gridAxisLabels.xLabels}
        yLabels={gridAxisLabels.yLabels}
      />
      <SelectionHudPanel
        canShowSelectionHud={canShowSelectionHud}
        selectionHudPosition={selectionHudPosition}
        selectionHudRef={selectionHudRef}
        canColorSelection={canColorSelection}
        selectedColor={selectedColor}
        saveSelectedObjectsColor={saveSelectedObjectsColor}
        canResetSelectionRotation={canResetSelectionRotation}
        resetSelectedObjectsRotation={resetSelectedObjectsRotation}
        canEditSelectedLabel={canEditSelectedLabel}
        singleSelectedObject={singleSelectedObject}
        selectionLabelDraft={selectionLabelDraft}
        setSelectionLabelDraft={setSelectionLabelDraft}
        commitSelectionLabelDraft={commitSelectionLabelDraft}
        persistObjectLabelText={persistObjectLabelText}
      />
      <StageObjectLayer
        objects={objects}
        viewportX={viewport.x}
        viewportY={viewport.y}
        viewportScale={viewport.scale}
        draftGeometryById={draftGeometryById}
        textDrafts={textDrafts}
        selectedObjectIds={selectedObjectIds}
        connectorRoutesById={connectorRoutesById}
        resolvedTheme={resolvedTheme}
        canEdit={canEdit}
        isObjectDragging={isObjectDragging}
        connectorEndpointDragObjectId={connectorEndpointDragObjectId}
        shouldPreserveGroupSelection={shouldPreserveGroupSelection}
        selectSingleObject={selectSingleObject}
        toggleObjectSelection={toggleObjectSelection}
        startObjectDrag={startObjectDrag}
        startShapeRotate={startShapeRotate}
        startCornerResize={startCornerResize}
        startLineEndpointResize={startLineEndpointResize}
        startConnectorEndpointDrag={startConnectorEndpointDrag}
        updateGridContainerDimensions={updateGridContainerDimensions}
        getGridDraftForObject={getGridDraftForObject}
        queueGridContentSync={queueGridContentSync}
        saveGridContainerCellColors={saveGridContainerCellColors}
        stickyTextHoldDragRef={stickyTextHoldDragRef}
        clearStickyTextHoldDrag={clearStickyTextHoldDrag}
        setTextDrafts={setTextDrafts}
        queueStickyTextSync={queueStickyTextSync}
        flushStickyTextSync={flushStickyTextSync}
      />
      <StageOverlays
        shouldShowConnectorAnchors={shouldShowConnectorAnchors}
        connectorAnchorPoints={connectorAnchorPoints}
        marqueeRect={marqueeRect}
        viewport={viewport}
        remoteCursors={remoteCursors}
        fps={fps}
        fpsTone={fpsTone}
        fpsTarget={fpsTarget}
      />
    </div>
  );
}
