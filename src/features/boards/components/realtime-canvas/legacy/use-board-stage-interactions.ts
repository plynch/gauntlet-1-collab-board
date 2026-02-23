import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type { BoardPoint, ConnectorDraft, MarqueeSelectionState, PanState, ViewportState, DragState, CornerResizeState, LineEndpointResizeState, ConnectorEndpointDragState, RotateState, ResizeCorner } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";
import { useBoardStageDragStarters } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-drag-starters";
import type { LineEndpoint } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useBoardStagePointerEvents } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-pointer-events";
import type { ObjectGeometry } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

export type UseBoardStageInteractionsParams = {
  canEdit: boolean;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
  marqueeSelectionStateRef: MutableRefObject<MarqueeSelectionState | null>;
  panStateRef: MutableRefObject<PanState | null>;
  viewportRef: MutableRefObject<ViewportState>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  dragStateRef: MutableRefObject<DragState | null>;
  setIsObjectDragging: Dispatch<SetStateAction<boolean>>;
  setMarqueeSelectionState: Dispatch<SetStateAction<MarqueeSelectionState | null>>;
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

type UseBoardStageInteractionsResult = {
  handleStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
  startObjectDrag: (objectId: string, event: ReactPointerEvent<HTMLElement>) => void;
  startShapeRotate: (objectId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  startCornerResize: (
    objectId: string,
    corner: ResizeCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startLineEndpointResize: (
    objectId: string,
    endpoint: LineEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startConnectorEndpointDrag: (
    objectId: string,
    endpoint: "from" | "to",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function useBoardStageInteractions(
  params: UseBoardStageInteractionsParams,
): UseBoardStageInteractionsResult {
  const {
    canEdit,
    setSelectedObjectIds,
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
    setMarqueeSelectionState,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef,
  } = params;

  const { handleStagePointerDown, handleStagePointerMove, handleStagePointerLeave } =
    useBoardStagePointerEvents({
      setSelectedObjectIds,
      toBoardCoordinates,
      marqueeSelectionStateRef,
      panStateRef,
      viewportRef,
      setMarqueeSelectionState,
      setCursorBoardPosition,
      updateCursor,
      sendCursorAtRef,
    });

  const {
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  } = useBoardStageDragStarters({
    canEdit,
    toBoardCoordinates,
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
  });

  return {
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
