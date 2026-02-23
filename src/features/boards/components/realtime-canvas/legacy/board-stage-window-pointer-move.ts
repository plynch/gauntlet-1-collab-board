import {
  CONNECTOR_SNAP_DISTANCE_PX,
  RESIZE_THROTTLE_MS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import type { ConnectorAnchor } from "@/features/boards/types";
import type { ConnectorDraft } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

import { handleBoardStageWindowPointerSecondaryMove } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-move-secondary";

export function handleBoardStageWindowPointerMove(
  event: PointerEvent,
  params: UseBoardStageWindowPointerEventsParams,
): void {
  const {
    aiFooterResizeStateRef,
    cornerResizeStateRef,
    connectorEndpointDragStateRef,
    canEditRef,
    objectsByIdRef,
    draftGeometryByIdRef,
    draftConnectorByIdRef,
    setDraftGeometry,
    setDraftConnector,
    getConnectableAnchorPoints,
    getConnectorDraftForObject,
    getResizedGeometry,
    viewportRef,
    updateConnectorDraft,
    updateObjectGeometry,
    clampAiFooterHeight,
    setAiFooterHeight,
  } = params;

  const aiFooterResizeState = aiFooterResizeStateRef.current;
  if (aiFooterResizeState) {
    const deltaY = aiFooterResizeState.startClientY - event.clientY;
    const nextHeight = clampAiFooterHeight(
      aiFooterResizeState.initialHeight + deltaY,
    );
    setAiFooterHeight(nextHeight);
    return;
  }

  const scale = viewportRef.current.scale;
  const cornerResizeState = cornerResizeStateRef.current;
  if (cornerResizeState) {
    const nextGeometry = getResizedGeometry(
      cornerResizeState,
      event.clientX,
      event.clientY,
      scale,
    );

    setDraftGeometry(cornerResizeState.objectId, nextGeometry);

    const now = Date.now();
    if (
      canEditRef.current &&
      now - cornerResizeState.lastSentAt >= RESIZE_THROTTLE_MS
    ) {
      cornerResizeState.lastSentAt = now;
      void updateObjectGeometry(cornerResizeState.objectId, nextGeometry, {
        includeUpdatedAt: false,
      });
    }
    return;
  }

  const connectorEndpointDragState = connectorEndpointDragStateRef.current;
  if (connectorEndpointDragState) {
    const stageElement = params.stageRef.current;
    if (!stageElement) {
      return;
    }

    const rect = stageElement.getBoundingClientRect();
    const movingPoint = {
      x: (event.clientX - rect.left - viewportRef.current.x) / scale,
      y: (event.clientY - rect.top - viewportRef.current.y) / scale,
    };

    const connectorObject = objectsByIdRef.current.get(
      connectorEndpointDragState.objectId,
    );
    if (!connectorObject || !isConnectorKind(connectorObject.type)) {
      return;
    }

    const currentDraft =
      draftConnectorByIdRef.current[connectorObject.id] ??
      getConnectorDraftForObject(connectorObject);
    if (!currentDraft) {
      return;
    }

    const snapThreshold =
      CONNECTOR_SNAP_DISTANCE_PX / Math.max(viewportRef.current.scale, 0.1);
    const anchorCandidates = getConnectableAnchorPoints();
    const nearestAnchor = anchorCandidates.reduce<{
      objectId: string;
      anchor: ConnectorAnchor;
      x: number;
      y: number;
      distance: number;
    } | null>((closest, candidate) => {
      const distance = Math.hypot(
        candidate.x - movingPoint.x,
        candidate.y - movingPoint.y,
      );
      if (distance > snapThreshold) {
        return closest;
      }

      if (!closest || distance < closest.distance) {
        return {
          ...candidate,
          distance,
        };
      }

      return closest;
    }, null);

    const endpointPatch = nearestAnchor
      ? {
          objectId: nearestAnchor.objectId,
          anchor: nearestAnchor.anchor,
          x: nearestAnchor.x,
          y: nearestAnchor.y,
        }
      : {
          objectId: null,
          anchor: null,
          x: movingPoint.x,
          y: movingPoint.y,
        };

    const nextDraft: ConnectorDraft =
      connectorEndpointDragState.endpoint === "from"
        ? {
            ...currentDraft,
            fromObjectId: endpointPatch.objectId,
            fromAnchor: endpointPatch.anchor,
            fromX: endpointPatch.x,
            fromY: endpointPatch.y,
          }
        : {
            ...currentDraft,
            toObjectId: endpointPatch.objectId,
            toAnchor: endpointPatch.anchor,
            toX: endpointPatch.x,
            toY: endpointPatch.y,
          };

    setDraftConnector(connectorObject.id, nextDraft);

    const now = Date.now();
    if (
      canEditRef.current &&
      now - connectorEndpointDragState.lastSentAt >= RESIZE_THROTTLE_MS
    ) {
      connectorEndpointDragState.lastSentAt = now;
      void updateConnectorDraft(connectorObject.id, nextDraft, {
        includeUpdatedAt: false,
      });
    }
    return;
  }
  if (handleBoardStageWindowPointerSecondaryMove(event, params, scale)) {
    return;
  }
}
