import {
  CONTAINER_DRAG_THROTTLE_MS,
  DRAG_THROTTLE_MS,
  GRID_CONTAINER_DEFAULT_GAP,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { snapToGrid } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { isSnapEligibleObjectType } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

export function handleBoardStageWindowPointerDragMove(
  event: PointerEvent,
  params: UseBoardStageWindowPointerEventsParams,
): void {
  const {
    dragStateRef,
    snapToGridEnabledRef,
    canEditRef,
    viewportRef,
    objectsByIdRef,
    getCurrentObjectGeometry,
    setDraftGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    updateObjectPositionsBatch,
  } = params;

  const dragState = dragStateRef.current;
  if (!dragState) {
    return;
  }

  const deltaX = (event.clientX - dragState.startClientX) / viewportRef.current.scale;
  const deltaY = (event.clientY - dragState.startClientY) / viewportRef.current.scale;

  const nextPositionsById: Record<string, { x: number; y: number }> = {};
  const draggedContainerIds: string[] = [];

  dragState.objectIds.forEach((objectId) => {
    const initialGeometry = dragState.initialGeometries[objectId];
    const currentGeometry = getCurrentObjectGeometry(objectId);
    const objectItem = objectsByIdRef.current.get(objectId);
    if (!initialGeometry || !currentGeometry) {
      return;
    }

    let nextX = initialGeometry.x + deltaX;
    let nextY = initialGeometry.y + deltaY;

    if (
      snapToGridEnabledRef.current &&
      objectItem &&
      isSnapEligibleObjectType(objectItem.type)
    ) {
      nextX = snapToGrid(nextX);
      nextY = snapToGrid(nextY);
    }

    nextPositionsById[objectId] = {
      x: nextX,
      y: nextY,
    };

    setDraftGeometry(objectId, {
      ...currentGeometry,
      x: nextX,
      y: nextY,
    });

    if (objectItem?.type === "gridContainer") {
      draggedContainerIds.push(objectId);
    }
  });

  draggedContainerIds.forEach((containerId) => {
    const containerItem = objectsByIdRef.current.get(containerId);
    const nextPosition = nextPositionsById[containerId];
    if (
      !containerItem ||
      containerItem.type !== "gridContainer" ||
      !nextPosition
    ) {
      return;
    }

    const nextContainerGeometry = {
      x: nextPosition.x,
      y: nextPosition.y,
      width: containerItem.width,
      height: containerItem.height,
      rotationDeg: containerItem.rotationDeg,
    };
    const rows = Math.max(1, containerItem.gridRows ?? 2);
    const cols = Math.max(1, containerItem.gridCols ?? 2);
    const gap = Math.max(0, containerItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP);

    const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
      containerId,
      nextContainerGeometry,
      rows,
      cols,
      gap,
      {
        clampToSectionBounds: false,
        includeObjectsInNextBounds: false,
      },
    );

    Object.entries(childUpdates.positionByObjectId).forEach(
      ([childId, childPosition]) => {
        if (childId in nextPositionsById) {
          return;
        }

        nextPositionsById[childId] = childPosition;
        const currentChildGeometry = getCurrentObjectGeometry(childId);
        if (!currentChildGeometry) {
          return;
        }
        setDraftGeometry(childId, {
          ...currentChildGeometry,
          x: childPosition.x,
          y: childPosition.y,
        });
      },
    );
  });

  const now = Date.now();
  const dragThrottleMs =
    draggedContainerIds.length > 0
      ? CONTAINER_DRAG_THROTTLE_MS
      : DRAG_THROTTLE_MS;
  if (canEditRef.current && now - dragState.lastSentAt >= dragThrottleMs) {
    dragState.lastSentAt = now;
    void updateObjectPositionsBatch(nextPositionsById, {
      includeUpdatedAt: false,
    });
  }
}
