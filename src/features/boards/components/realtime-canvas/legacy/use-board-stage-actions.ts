import { useCallback, type WheelEvent as ReactWheelEvent } from "react";
import type { MutableRefObject, Dispatch, SetStateAction } from "react";

import { useBoardZoomControls } from "@/features/boards/components/realtime-canvas/legacy/use-board-zoom-controls";
import { useBoardStageInteractions } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-interactions";
import type {
  BoardPoint,
  ConnectorDraft,
  ConnectorEndpointDragState,
  CornerResizeState,
  DragState,
  LineEndpointResizeState,
  MarqueeSelectionState,
  ObjectGeometry,
  PanState,
  RotateState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";

type UseBoardStageActionsArgs = {
  canEdit: boolean;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportState>;
  setViewport: Dispatch<SetStateAction<ViewportState>>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  setMarqueeSelectionState: Dispatch<SetStateAction<MarqueeSelectionState | null>>;
  marqueeSelectionStateRef: MutableRefObject<MarqueeSelectionState | null>;
  panStateRef: MutableRefObject<PanState | null>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  dragStateRef: MutableRefObject<DragState | null>;
  setIsObjectDragging: Dispatch<SetStateAction<boolean>>;
  rotateStateRef: MutableRefObject<RotateState | null>;
  cornerResizeStateRef: MutableRefObject<CornerResizeState | null>;
  lineEndpointResizeStateRef: MutableRefObject<LineEndpointResizeState | null>;
  connectorEndpointDragStateRef: MutableRefObject<ConnectorEndpointDragState | null>;
  setDraftConnector: (objectId: string, draft: ConnectorDraft) => void;
  getConnectorDraftForObject: (objectItem: BoardObject) => ConnectorDraft | null;
  setCursorBoardPosition: Dispatch<SetStateAction<BoardPoint | null>>;
  updateCursor: (cursor: BoardPoint | null, options?: { force?: boolean }) => Promise<void>;
  sendCursorAtRef: MutableRefObject<number>;
};

export function useBoardStageActions({
  canEdit,
  stageRef,
  viewportRef,
  setViewport,
  setSelectedObjectIds,
  setMarqueeSelectionState,
  marqueeSelectionStateRef,
  panStateRef,
  objectsByIdRef,
  selectedObjectIdsRef,
  getCurrentObjectGeometry,
  selectSingleObject,
  toggleObjectSelection,
  dragStateRef,
  setIsObjectDragging,
  rotateStateRef,
  cornerResizeStateRef,
  lineEndpointResizeStateRef,
  connectorEndpointDragStateRef,
  setDraftConnector,
  getConnectorDraftForObject,
  setCursorBoardPosition,
  updateCursor,
  sendCursorAtRef,
}: UseBoardStageActionsArgs) {
  const {
    toBoardCoordinates,
    zoomAtStageCenter,
    nudgeZoom,
    handleWheel,
  } = useBoardZoomControls({
    stageRef,
    viewportRef,
    setViewport,
  });

  const handleStageWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      handleWheel(event);
    },
    [handleWheel],
  );

  const {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  } = useBoardStageInteractions({
    canEdit,
    setSelectedObjectIds,
    setMarqueeSelectionState,
    toBoardCoordinates,
    marqueeSelectionStateRef,
    panStateRef,
    viewportRef,
    objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef,
  });

  return {
    zoomAtStageCenter,
    nudgeZoom,
    handleWheel,
    handleStageWheelCapture,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  };
}
