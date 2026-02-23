import { useCallback, type MutableRefObject } from "react";
import { doc, serverTimestamp, writeBatch, type Firestore } from "firebase/firestore";

import { canUseSelectionHudColor } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  hasMeaningfulRotation,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import type { BoardObject } from "@/features/boards/types";
import type { ObjectGeometry, RotateState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type UseSelectionStyleActionsArgs = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  rotateStateRef: MutableRefObject<RotateState | null>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  setDraftGeometry: (objectId: string, geometry: ObjectGeometry) => void;
  clearDraftGeometry: (objectId: string) => void;
  setSelectedObjectIds: (updater: (previous: string[]) => string[]) => void;
  setBoardError: (value: string | null) => void;
};

export function useSelectionStyleActions({
  boardId,
  db,
  canEditRef,
  selectedObjectIdsRef,
  objectsByIdRef,
  rotateStateRef,
  getCurrentObjectGeometry,
  setDraftGeometry,
  clearDraftGeometry,
  setSelectedObjectIds,
  setBoardError,
}: UseSelectionStyleActionsArgs) {
  const saveSelectedObjectsColor = useCallback(
    async (color: string) => {
      if (!canEditRef.current) {
        return;
      }

      const objectIdsToUpdate = Array.from(selectedObjectIdsRef.current).filter(
        (objectId) => {
          const objectItem = objectsByIdRef.current.get(objectId);
          return objectItem ? canUseSelectionHudColor(objectItem) : false;
        },
      );
      if (objectIdsToUpdate.length === 0) {
        return;
      }

      try {
        const batch = writeBatch(db);
        const updatedAt = serverTimestamp();

        objectIdsToUpdate.forEach((objectId) => {
          batch.update(doc(db, `boards/${boardId}/objects/${objectId}`), {
            color,
            updatedAt,
          });
        });

        await batch.commit();
      } catch (error) {
        console.error("Failed to update selected object colors", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update selected object colors."),
        );
      }
    },
    [boardId, canEditRef, db, objectsByIdRef, selectedObjectIdsRef, setBoardError],
  );

  const resetSelectedObjectsRotation = useCallback(async () => {
    if (!canEditRef.current) {
      return;
    }

    const targets = Array.from(selectedObjectIdsRef.current)
      .map((objectId) => {
        const geometry = getCurrentObjectGeometry(objectId);
        if (!geometry) {
          return null;
        }

        return { objectId, geometry };
      })
      .filter(
        (
          item,
        ): item is {
          objectId: string;
          geometry: ObjectGeometry;
        } => item !== null,
      )
      .filter((item) => hasMeaningfulRotation(item.geometry.rotationDeg));

    if (targets.length === 0) {
      return;
    }

    rotateStateRef.current = null;

    targets.forEach((target) => {
      setDraftGeometry(target.objectId, {
        ...target.geometry,
        rotationDeg: 0,
      });
    });

    try {
      const batch = writeBatch(db);
      const updatedAt = serverTimestamp();

      targets.forEach((target) => {
        batch.update(doc(db, `boards/${boardId}/objects/${target.objectId}`), {
          x: target.geometry.x,
          y: target.geometry.y,
          width: target.geometry.width,
          height: target.geometry.height,
          rotationDeg: 0,
          updatedAt,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Failed to reset selected object rotation", error);
      setBoardError(
        toBoardErrorMessage(error, "Failed to reset selected object rotation."),
      );
    } finally {
      targets.forEach((target) => {
        window.setTimeout(() => {
          clearDraftGeometry(target.objectId);
        }, 180);
      });
    }
  }, [
    boardId,
    canEditRef,
    clearDraftGeometry,
    db,
    getCurrentObjectGeometry,
    rotateStateRef,
    selectedObjectIdsRef,
    setBoardError,
    setDraftGeometry,
  ]);

  const selectSingleObject = useCallback(
    (objectId: string) => {
      setSelectedObjectIds((previous) =>
        previous.length === 1 && previous[0] === objectId ? previous : [objectId],
      );
    },
    [setSelectedObjectIds],
  );

  const toggleObjectSelection = useCallback(
    (objectId: string) => {
      setSelectedObjectIds((previous) => {
        if (previous.includes(objectId)) {
          return previous.filter((id) => id !== objectId);
        }

        return [...previous, objectId];
      });
    },
    [setSelectedObjectIds],
  );

  const shouldPreserveGroupSelection = useCallback(
    (objectId: string) => {
      const currentSelectedIds = selectedObjectIdsRef.current;
      return currentSelectedIds.size > 1 && currentSelectedIds.has(objectId);
    },
    [selectedObjectIdsRef],
  );

  return {
    saveSelectedObjectsColor,
    resetSelectedObjectsRotation,
    selectSingleObject,
    toggleObjectSelection,
    shouldPreserveGroupSelection,
  };
}
