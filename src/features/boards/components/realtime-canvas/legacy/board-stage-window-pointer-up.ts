import type { BoardPoint } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { GRID_CONTAINER_DEFAULT_GAP } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { snapToGrid } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { toNormalizedRect } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type { ContainerMembershipPatch } from "@/features/boards/components/realtime-canvas/use-container-membership";
import { isSnapEligibleObjectType } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

export function handleBoardStageWindowPointerUp(
  event: PointerEvent,
  params: UseBoardStageWindowPointerEventsParams,
): void {
  const {
    aiFooterResizeStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    rotateStateRef,
    marqueeSelectionStateRef,
    dragStateRef,
    objectsByIdRef,
    draftGeometryByIdRef,
    draftConnectorByIdRef,
    panStateRef,
    viewportRef,
    setIsAiFooterResizing,
    setSelectedObjectIds,
    setMarqueeSelectionState,
    setIsObjectDragging,
    clearStickyTextHoldDrag,
    clearDraftGeometry,
    clearDraftConnector,
    getObjectsIntersectingRect,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    updateObjectGeometry,
    updateConnectorDraft,
    canEditRef,
    snapToGridEnabledRef,
  } = params;

  clearStickyTextHoldDrag();

  if (aiFooterResizeStateRef.current) {
    aiFooterResizeStateRef.current = null;
    setIsAiFooterResizing(false);
    return;
  }

  const cornerResizeState = cornerResizeStateRef.current;
  if (cornerResizeState) {
    cornerResizeStateRef.current = null;
    const finalGeometry = draftGeometryByIdRef.current[cornerResizeState.objectId];
    const resizedObject = objectsByIdRef.current.get(
      cornerResizeState.objectId,
    );
    clearDraftGeometry(cornerResizeState.objectId);

    if (finalGeometry && canEditRef.current) {
      void (async () => {
        await updateObjectGeometry(cornerResizeState.objectId, finalGeometry, {
          includeUpdatedAt: true,
          force: true,
        });

        if (resizedObject?.type === "gridContainer") {
          const rows = Math.max(1, resizedObject.gridRows ?? 2);
          const cols = Math.max(1, resizedObject.gridCols ?? 2);
          const gap = Math.max(
            0,
            resizedObject.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
          );
          const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
            resizedObject.id,
            finalGeometry,
            rows,
            cols,
            gap,
          );
          const childIds = Object.keys(childUpdates.positionByObjectId);
          if (childIds.length > 0) {
            const membershipByObjectId =
              buildContainerMembershipPatchesForPositions(
                childUpdates.positionByObjectId,
                childUpdates.membershipByObjectId,
              );
            await updateObjectPositionsBatch(childUpdates.positionByObjectId, {
              includeUpdatedAt: true,
              force: true,
              containerMembershipById: membershipByObjectId,
            });
          }
        }
      })();
    }
    return;
  }

  const lineEndpointResizeState = lineEndpointResizeStateRef.current;
  if (lineEndpointResizeState) {
    lineEndpointResizeStateRef.current = null;
    const finalGeometry = draftGeometryByIdRef.current[lineEndpointResizeState.objectId];
    clearDraftGeometry(lineEndpointResizeState.objectId);

    if (finalGeometry && canEditRef.current) {
      void updateObjectGeometry(lineEndpointResizeState.objectId, finalGeometry, {
        includeUpdatedAt: true,
        force: true,
      });
    }
    return;
  }

  const connectorEndpointDragState = connectorEndpointDragStateRef.current;
  if (connectorEndpointDragState) {
    connectorEndpointDragStateRef.current = null;
    const finalDraft =
      draftConnectorByIdRef.current[connectorEndpointDragState.objectId];
    clearDraftConnector(connectorEndpointDragState.objectId);

    if (finalDraft && canEditRef.current) {
      void updateConnectorDraft(connectorEndpointDragState.objectId, finalDraft, {
        includeUpdatedAt: true,
      });
    }
    return;
  }

  const rotateState = rotateStateRef.current;
  if (rotateState) {
    rotateStateRef.current = null;
    const finalGeometry = draftGeometryByIdRef.current[rotateState.objectId];
    clearDraftGeometry(rotateState.objectId);

    if (finalGeometry && canEditRef.current) {
      void updateObjectGeometry(rotateState.objectId, finalGeometry, {
        includeUpdatedAt: true,
        force: true,
      });
    }
    return;
  }

  const marqueeSelectionState = marqueeSelectionStateRef.current;
  if (marqueeSelectionState) {
    marqueeSelectionStateRef.current = null;
    setMarqueeSelectionState(null);

    const rect = toNormalizedRect(
      marqueeSelectionState.startPoint,
      marqueeSelectionState.currentPoint,
    );
    const intersectingObjectIds = getObjectsIntersectingRect(rect);

    if (marqueeSelectionState.mode === "add") {
      setSelectedObjectIds((previous) => {
        const next = new Set(previous);
        intersectingObjectIds.forEach((objectId) => next.add(objectId));
        return Array.from(next);
      });
    } else {
      const removeSet = new Set(intersectingObjectIds);
      setSelectedObjectIds((previous) =>
        previous.filter((objectId) => !removeSet.has(objectId)),
      );
    }
    return;
  }

  if (panStateRef.current) {
    panStateRef.current = null;
  }

  const dragState = dragStateRef.current;
  if (!dragState) {
    return;
  }

  const deltaX = (event.clientX - dragState.startClientX) / viewportRef.current.scale;
  const deltaY = (event.clientY - dragState.startClientY) / viewportRef.current.scale;

  dragStateRef.current = null;
  setIsObjectDragging(false);

  if (!dragState.hasMoved) {
    dragState.objectIds.forEach((objectId) => {
      clearDraftGeometry(objectId);
    });

    if (dragState.collapseToObjectIdOnClick) {
      setSelectedObjectIds([dragState.collapseToObjectIdOnClick]);
    }
    return;
  }

  if (canEditRef.current) {
    const nextPositionsById: Record<string, BoardPoint> = {};
    const seedMembershipByObjectId: Record<string, ContainerMembershipPatch> = {};

    dragState.objectIds.forEach((objectId) => {
      const initialGeometry = dragState.initialGeometries[objectId];
      const objectItem = objectsByIdRef.current.get(objectId);
      if (!initialGeometry) {
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
      clearDraftGeometry(objectId);
    });

    dragState.objectIds.forEach((objectId) => {
      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "gridContainer") {
        return;
      }

      const nextPosition = nextPositionsById[objectId];
      if (!nextPosition) {
        return;
      }

      const nextContainerGeometry = {
        x: nextPosition.x,
        y: nextPosition.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
      const rows = Math.max(1, objectItem.gridRows ?? 2);
      const cols = Math.max(1, objectItem.gridCols ?? 2);
      const gap = Math.max(0, objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP);
      const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
        objectId,
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
          if (!(childId in nextPositionsById)) {
            nextPositionsById[childId] = childPosition;
          }
        },
      );
      Object.entries(childUpdates.membershipByObjectId).forEach(
        ([childId, patch]) => {
          if (!(childId in seedMembershipByObjectId)) {
            seedMembershipByObjectId[childId] = patch;
          }
        },
      );
    });

    const membershipByObjectId =
      buildContainerMembershipPatchesForPositions(
        nextPositionsById,
        seedMembershipByObjectId,
      );

    Object.keys(nextPositionsById).forEach((objectId) => {
      clearDraftGeometry(objectId);
    });

    void updateObjectPositionsBatch(nextPositionsById, {
      includeUpdatedAt: true,
      force: true,
      containerMembershipById: membershipByObjectId,
    });
  } else {
    dragState.objectIds.forEach((objectId) => {
      clearDraftGeometry(objectId);
    });
  }
}
