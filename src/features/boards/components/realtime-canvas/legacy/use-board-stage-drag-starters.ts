import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type {
  BoardPoint,
  DragState,
  LineEndpoint,
  ObjectGeometry,
  ResizeCorner,
  CornerResizeState,
  LineEndpointResizeState,
  ConnectorEndpointDragState,
  RotateState,
  ConnectorDraft,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";
import { useBoardObjectDragStarter } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-drag-helpers";
import { useBoardShapeStarters } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-shape-starters";

type UseBoardStageDragStartersParams = {
  canEdit: boolean;
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
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
};

type UseBoardStageDragStartersResult = {
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

export function useBoardStageDragStarters(
  params: UseBoardStageDragStartersParams,
): UseBoardStageDragStartersResult {
  const {
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
  } = params;

  const { startObjectDrag } = useBoardObjectDragStarter({
    canEdit,
    objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
  });

  const shapeStarters = useBoardShapeStarters({
    canEdit,
    toBoardCoordinates,
    objectsByIdRef,
    selectSingleObject,
    getCurrentObjectGeometry,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
  });

  return {
    startObjectDrag,
    ...shapeStarters,
  };
}
