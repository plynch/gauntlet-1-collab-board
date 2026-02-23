import type { Firestore } from "firebase/firestore";

import {
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  getDistance,
  roundToStep,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  GRID_CONTAINER_DEFAULT_GAP,
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { useDraftGeometryAndConnectors } from "@/features/boards/components/realtime-canvas/legacy/use-draft-geometry-and-connectors";
import { useSelectionGeometryActions } from "@/features/boards/components/realtime-canvas/legacy/use-selection-geometry-actions";
import { useContainerMembership } from "@/features/boards/components/realtime-canvas/use-container-membership";
import { useObjectWriteActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-write-actions";
import { useResizeGeometry } from "@/features/boards/components/realtime-canvas/legacy/use-resize-geometry";
import { useBoardStageWindowPointerEvents } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events";
import { useLegacyCanvasState } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-state";
import { clampAiFooterHeight } from "@/features/boards/components/realtime-canvas/ai-footer-config";

type LegacyCanvasStateShape = ReturnType<typeof useLegacyCanvasState>;

type UseLegacyCanvasGeometryWiringArgs = {
  boardId: string;
  db: Firestore;
  refs: LegacyCanvasStateShape["refs"];
  state: LegacyCanvasStateShape["state"];
  clearStickyTextHoldDrag: () => void;
};

export function useLegacyCanvasGeometryWiring({
  boardId,
  db,
  refs,
  state,
  clearStickyTextHoldDrag,
}: UseLegacyCanvasGeometryWiringArgs) {
  const {
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    clearDraftConnector,
    getConnectorDraftForObject,
    resolveConnectorEndpoint,
    getResolvedConnectorEndpoints,
  } = useDraftGeometryAndConnectors({
    draftGeometryByIdRef: refs.draftGeometryByIdRef,
    draftConnectorByIdRef: refs.draftConnectorByIdRef,
    objectsByIdRef: refs.objectsByIdRef,
    setDraftGeometryById: state.setDraftGeometryById,
    setDraftConnectorById: state.setDraftConnectorById,
  });

  const {
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
  } = useContainerMembership({
    objectsByIdRef: refs.objectsByIdRef,
    getCurrentObjectGeometry,
    maxRows: GRID_CONTAINER_MAX_ROWS,
    maxCols: GRID_CONTAINER_MAX_COLS,
    defaultGap: GRID_CONTAINER_DEFAULT_GAP,
    getDistance,
    roundToStep,
    isConnectorKind,
  });

  const {
    updateObjectGeometry,
    updateConnectorDraft,
    updateObjectPositionsBatch,
  } = useObjectWriteActions({
    boardId,
    db,
    canEditRef: refs.canEditRef,
    objectsByIdRef: refs.objectsByIdRef,
    writeMetricsRef: refs.writeMetricsRef,
    lastGeometryWriteByIdRef: refs.lastGeometryWriteByIdRef,
    lastPositionWriteByIdRef: refs.lastPositionWriteByIdRef,
    setBoardError: state.setBoardError,
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    resolveConnectorEndpoint,
  });

  const {
    getObjectsIntersectingRect,
    getConnectableAnchorPoints,
  } = useSelectionGeometryActions({
    objectsByIdRef: refs.objectsByIdRef,
    getCurrentObjectGeometry,
    getResolvedConnectorEndpoints,
  });

  const { getResizedGeometry, getLineGeometryFromEndpointDrag } =
    useResizeGeometry({
      snapToGridEnabledRef: refs.snapToGridEnabledRef,
    });

  useBoardStageWindowPointerEvents({
    aiFooterResizeStateRef: refs.aiFooterResizeStateRef,
    cornerResizeStateRef: refs.cornerResizeStateRef,
    connectorEndpointDragStateRef: refs.connectorEndpointDragStateRef,
    dragStateRef: refs.dragStateRef,
    lineEndpointResizeStateRef: refs.lineEndpointResizeStateRef,
    marqueeSelectionStateRef: refs.marqueeSelectionStateRef,
    objectsByIdRef: refs.objectsByIdRef,
    panStateRef: refs.panStateRef,
    rotateStateRef: refs.rotateStateRef,
    stageRef: refs.stageRef,
    snapToGridEnabledRef: refs.snapToGridEnabledRef,
    canEditRef: refs.canEditRef,
    draftConnectorByIdRef: refs.draftConnectorByIdRef,
    draftGeometryByIdRef: refs.draftGeometryByIdRef,
    setDraftConnector,
    setDraftGeometry,
    setSelectedObjectIds: state.setSelectedObjectIds,
    setIsObjectDragging: state.setIsObjectDragging,
    setMarqueeSelectionState: state.setMarqueeSelectionState,
    setIsAiFooterResizing: state.setIsAiFooterResizing,
    setAiFooterHeight: state.setAiFooterHeight,
    updateObjectGeometry,
    updateObjectPositionsBatch,
    updateConnectorDraft,
    clearDraftConnector,
    clearDraftGeometry,
    clearStickyTextHoldDrag,
    setViewport: state.setViewport,
    getCurrentObjectGeometry,
    getConnectorDraftForObject,
    getConnectableAnchorPoints,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    getObjectsIntersectingRect,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    viewportRef: refs.viewportRef,
    clampAiFooterHeight,
  });

  return {
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    clearDraftConnector,
    getConnectorDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    getConnectableAnchorPoints,
  };
}
