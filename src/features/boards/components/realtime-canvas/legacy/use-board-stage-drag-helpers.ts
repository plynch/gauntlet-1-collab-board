import { useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RefObject, MutableRefObject, Dispatch, SetStateAction } from "react";

import type {
  DragState,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import type { BoardObject } from "@/features/boards/types";

type UseBoardObjectDragStarterParams = {
  canEdit: boolean;
  objectsByIdRef: RefObject<Map<string, BoardObject>>;
  selectedObjectIdsRef: RefObject<Set<string>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  dragStateRef: MutableRefObject<DragState | null>;
  setIsObjectDragging: Dispatch<SetStateAction<boolean>>;
};

type UseBoardObjectDragStarterResult = {
  startObjectDrag: (
    objectId: string,
    event: ReactPointerEvent<HTMLElement>,
  ) => void;
};

export function useBoardObjectDragStarter(
  params: UseBoardObjectDragStarterParams,
): UseBoardObjectDragStarterResult {
  const {
    canEdit,
    objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
  } = params;

  const startObjectDrag = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        toggleObjectSelection(objectId);
        return;
      }

      const sourceObject = objectsByIdRef.current.get(objectId);
      if (sourceObject && isConnectorKind(sourceObject.type)) {
        selectSingleObject(objectId);
        return;
      }

      const currentSelectedIds = selectedObjectIdsRef.current;
      const shouldPrepareGroupDrag =
        currentSelectedIds.has(objectId) && currentSelectedIds.size > 1;
      const dragObjectIds = (
        shouldPrepareGroupDrag ? Array.from(currentSelectedIds) : [objectId]
      ).filter((candidateId) => {
        const candidateObject = objectsByIdRef.current.get(candidateId);
        return candidateObject ? !isConnectorKind(candidateObject.type) : false;
      });

      if (!shouldPrepareGroupDrag) {
        selectSingleObject(objectId);
      }

      const initialGeometries: Record<string, ObjectGeometry> = {};
      dragObjectIds.forEach((candidateId) => {
        const geometry = getCurrentObjectGeometry(candidateId);
        if (geometry) {
          initialGeometries[candidateId] = geometry;
        }
      });

      const availableObjectIds = Object.keys(initialGeometries);
      if (availableObjectIds.length === 0) {
        return;
      }

      setIsObjectDragging(true);
      dragStateRef.current = {
        objectIds: availableObjectIds,
        initialGeometries,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastSentAt: 0,
        hasMoved: false,
        collapseToObjectIdOnClick: shouldPrepareGroupDrag
          ? null
          : objectId,
      };
    },
    [
      canEdit,
      dragStateRef,
      getCurrentObjectGeometry,
      objectsByIdRef,
      selectSingleObject,
      selectedObjectIdsRef,
      setIsObjectDragging,
      toggleObjectSelection,
    ],
  );

  return { startObjectDrag };
}
