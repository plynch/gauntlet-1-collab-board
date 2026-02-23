import { snapToGrid, toDegrees } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { isSnapEligibleObjectType } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { RESIZE_THROTTLE_MS, ROTATE_THROTTLE_MS, DRAG_CLICK_SLOP_PX } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ObjectGeometry } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

import { handleBoardStageWindowPointerDragMove } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-move-drag";

export function handleBoardStageWindowPointerSecondaryMove(
  event: PointerEvent,
  params: UseBoardStageWindowPointerEventsParams,
  scale: number,
): boolean {
  const {
    lineEndpointResizeStateRef,
    dragStateRef,
    rotateStateRef,
    marqueeSelectionStateRef,
    panStateRef,
    snapToGridEnabledRef,
    canEditRef,
    getLineGeometryFromEndpointDrag,
    setDraftGeometry,
    setMarqueeSelectionState,
    setViewport,
    updateObjectGeometry,
  } = params;

  const lineEndpointResizeState = lineEndpointResizeStateRef.current;
  if (lineEndpointResizeState) {
    const stageElement = params.stageRef.current;
    if (!stageElement) {
      return true;
    }

    const rect = stageElement.getBoundingClientRect();
    const movingPoint = {
      x: (event.clientX - rect.left - params.viewportRef.current.x) / scale,
      y: (event.clientY - rect.top - params.viewportRef.current.y) / scale,
    };
    const nextMovingPoint =
      snapToGridEnabledRef.current && isSnapEligibleObjectType("line")
        ? {
            x: snapToGrid(movingPoint.x),
            y: snapToGrid(movingPoint.y),
          }
        : movingPoint;

    const nextGeometry = getLineGeometryFromEndpointDrag(
      lineEndpointResizeState,
      nextMovingPoint,
    );
    setDraftGeometry(lineEndpointResizeState.objectId, nextGeometry);

    const now = Date.now();
    if (canEditRef.current && now - lineEndpointResizeState.lastSentAt >= RESIZE_THROTTLE_MS) {
      lineEndpointResizeState.lastSentAt = now;
      void updateObjectGeometry(lineEndpointResizeState.objectId, nextGeometry, {
        includeUpdatedAt: false,
      });
    }
    return true;
  }

  const rotateState = rotateStateRef.current;
  if (rotateState) {
    const stageElement = params.stageRef.current;
    if (!stageElement) {
      return true;
    }

    const rect = stageElement.getBoundingClientRect();
    const pointer = {
      x: (event.clientX - rect.left - params.viewportRef.current.x) / scale,
      y: (event.clientY - rect.top - params.viewportRef.current.y) / scale,
    };

    const pointerAngleDeg = toDegrees(
      Math.atan2(
        pointer.y - rotateState.centerPoint.y,
        pointer.x - rotateState.centerPoint.x,
      ),
    );
    const deltaAngle = pointerAngleDeg - rotateState.initialPointerAngleDeg;
    let nextRotationDeg = rotateState.initialRotationDeg + deltaAngle;
    if (event.shiftKey) {
      nextRotationDeg = Math.round(nextRotationDeg / 15) * 15;
    }

    const normalizedRotationDeg = ((nextRotationDeg % 360) + 360) % 360;
    const geometry = params.getCurrentObjectGeometry(rotateState.objectId);
    if (!geometry) {
      return true;
    }

    const nextGeometry: ObjectGeometry = {
      ...geometry,
      rotationDeg: normalizedRotationDeg,
    };
    setDraftGeometry(rotateState.objectId, nextGeometry);

    const now = Date.now();
    if (canEditRef.current && now - rotateState.lastSentAt >= ROTATE_THROTTLE_MS) {
      rotateState.lastSentAt = now;
      void updateObjectGeometry(rotateState.objectId, nextGeometry, {
        includeUpdatedAt: false,
      });
    }
    return true;
  }

  const marqueeSelectionState = marqueeSelectionStateRef.current;
  if (marqueeSelectionState) {
    const stageElement = params.stageRef.current;
    if (!stageElement) {
      return true;
    }

    const rect = stageElement.getBoundingClientRect();
    const nextPoint = {
      x: (event.clientX - rect.left - params.viewportRef.current.x) / scale,
      y: (event.clientY - rect.top - params.viewportRef.current.y) / scale,
    };

    const nextMarqueeState = {
      ...marqueeSelectionState,
      currentPoint: nextPoint,
    };
    marqueeSelectionStateRef.current = nextMarqueeState;
    setMarqueeSelectionState(nextMarqueeState);
    return true;
  }

  const panState = panStateRef.current;
  if (panState) {
    const nextX =
      panState.initialX + (event.clientX - panState.startClientX);
    const nextY =
      panState.initialY + (event.clientY - panState.startClientY);
    setViewport((previous) => ({
      x: nextX,
      y: nextY,
      scale: previous.scale,
    }));
    return true;
  }

  const dragState = dragStateRef.current;
  if (!dragState) {
    return false;
  }

  const pointerDeltaX = event.clientX - dragState.startClientX;
  const pointerDeltaY = event.clientY - dragState.startClientY;
  if (!dragState.hasMoved) {
    dragState.hasMoved =
      Math.hypot(pointerDeltaX, pointerDeltaY) >= DRAG_CLICK_SLOP_PX;
  }
  if (!dragState.hasMoved) {
    return true;
  }

  handleBoardStageWindowPointerDragMove(event, params);
  return true;
}
