import { useEffect } from "react";

import { handleBoardStageWindowPointerMove } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-move";
import { handleBoardStageWindowPointerUp } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-up";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

export function useBoardStageWindowPointerEvents(
  params: UseBoardStageWindowPointerEventsParams,
): void {
  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) =>
      handleBoardStageWindowPointerMove(event, params);
    const handleWindowPointerUp = (event: PointerEvent) =>
      handleBoardStageWindowPointerUp(event, params);

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [
    params.aiFooterResizeStateRef,
    params.canEditRef,
    params.cornerResizeStateRef,
    params.connectorEndpointDragStateRef,
    params.dragStateRef,
    params.lineEndpointResizeStateRef,
    params.marqueeSelectionStateRef,
    params.panStateRef,
    params.viewportRef,
    params.rotateStateRef,
    params.objectsByIdRef,
    params.draftConnectorByIdRef,
    params.draftGeometryByIdRef,
    params.getConnectorDraftForObject,
    params.getConnectableAnchorPoints,
    params.getCurrentObjectGeometry,
    params.getLineGeometryFromEndpointDrag,
    params.getObjectsIntersectingRect,
    params.getResizedGeometry,
    params.setAiFooterHeight,
    params.setDraftConnector,
    params.setDraftGeometry,
    params.setIsAiFooterResizing,
    params.setIsObjectDragging,
    params.setMarqueeSelectionState,
    params.setSelectedObjectIds,
    params.setViewport,
    params.snapToGridEnabledRef,
    params.stageRef,
    params.buildContainerMembershipPatchesForPositions,
    params.getSectionAnchoredObjectUpdatesForContainer,
    params.updateConnectorDraft,
    params.updateObjectGeometry,
    params.updateObjectPositionsBatch,
    params.clearDraftConnector,
    params.clearDraftGeometry,
    params.clearStickyTextHoldDrag,
  ]);
}
