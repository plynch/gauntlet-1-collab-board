"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import {
  GRID_CONTAINER_DEFAULT_GAP,
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  getDefaultSectionTitles,
  normalizeSectionValues,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import type {
  BoardPoint,
  GridContainerContentDraft,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { ContainerMembershipPatch } from "@/features/boards/components/realtime-canvas/use-container-membership";
import type { BoardObject } from "@/features/boards/types";

type UseGridDimensionUpdatesProps = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  getGridDraftForObject: (objectItem: BoardObject) => GridContainerContentDraft;
  getSectionAnchoredObjectUpdatesForContainer: (
    objectId: string,
    nextGeometry: ObjectGeometry,
    nextRows: number,
    nextCols: number,
    gap: number,
  ) => {
    positionByObjectId: Record<string, BoardPoint>;
    membershipByObjectId: Record<string, ContainerMembershipPatch>;
  };
  buildContainerMembershipPatchesForPositions: (
    positionByObjectId: Record<string, BoardPoint>,
    baseMembershipByObjectId?: Record<string, ContainerMembershipPatch>,
  ) => Record<string, ContainerMembershipPatch>;
  updateObjectPositionsBatch: (
    nextPositions: Record<string, BoardPoint>,
    options?: {
      includeUpdatedAt?: boolean;
      force?: boolean;
      containerMembershipById?: Record<string, ContainerMembershipPatch>;
    },
  ) => Promise<void>;
  setGridContentDraftById: Dispatch<
    SetStateAction<Record<string, GridContainerContentDraft>>
  >;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export function useGridDimensionUpdates({
  boardId,
  db,
  canEditRef,
  objectsByIdRef,
  getCurrentObjectGeometry,
  getGridDraftForObject,
  getSectionAnchoredObjectUpdatesForContainer,
  buildContainerMembershipPatchesForPositions,
  updateObjectPositionsBatch,
  setGridContentDraftById,
  setBoardError,
}: UseGridDimensionUpdatesProps) {
  const updateGridContainerDimensions = useCallback(
    async (objectId: string, nextRowsRaw: number, nextColsRaw: number) => {
      if (!canEditRef.current) {
        return;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "gridContainer") {
        return;
      }

      const nextRows = Math.max(
        1,
        Math.min(GRID_CONTAINER_MAX_ROWS, Math.floor(nextRowsRaw)),
      );
      const nextCols = Math.max(
        1,
        Math.min(GRID_CONTAINER_MAX_COLS, Math.floor(nextColsRaw)),
      );
      const currentRows = Math.max(1, objectItem.gridRows ?? 2);
      const currentCols = Math.max(1, objectItem.gridCols ?? 2);
      if (nextRows === currentRows && nextCols === currentCols) {
        return;
      }

      const sectionCount = nextRows * nextCols;
      const fallbackTitles = getDefaultSectionTitles(nextRows, nextCols);
      const currentDraft = getGridDraftForObject(objectItem);
      const nextSectionTitles = normalizeSectionValues(
        currentDraft.sectionTitles,
        sectionCount,
        (index) => fallbackTitles[index] ?? `Section ${index + 1}`,
        80,
      );
      const nextSectionNotes = normalizeSectionValues(
        currentDraft.sectionNotes,
        sectionCount,
        () => "",
        600,
      );

      const nextCellColors = Array.from(
        { length: sectionCount },
        (_, index) => objectItem.gridCellColors?.[index] ?? "transparent",
      );
      const geometry = getCurrentObjectGeometry(objectId) ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
      const nextGap = Math.max(
        0,
        objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
      );
      const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
        objectId,
        geometry,
        nextRows,
        nextCols,
        nextGap,
      );
      const membershipByObjectId = buildContainerMembershipPatchesForPositions(
        childUpdates.positionByObjectId,
        childUpdates.membershipByObjectId,
      );

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          gridRows: nextRows,
          gridCols: nextCols,
          gridSectionTitles: nextSectionTitles,
          gridSectionNotes: nextSectionNotes,
          gridCellColors: nextCellColors,
          updatedAt: serverTimestamp(),
        });
        setGridContentDraftById((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });

        const childIds = Object.keys(childUpdates.positionByObjectId);
        if (childIds.length > 0) {
          await updateObjectPositionsBatch(childUpdates.positionByObjectId, {
            includeUpdatedAt: true,
            force: true,
            containerMembershipById: membershipByObjectId,
          });
        }
      } catch (error) {
        console.error("Failed to update grid container dimensions", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update grid container dimensions.",
          ),
        );
      }
    },
    [
      boardId,
      buildContainerMembershipPatchesForPositions,
      canEditRef,
      db,
      getCurrentObjectGeometry,
      getGridDraftForObject,
      getSectionAnchoredObjectUpdatesForContainer,
      objectsByIdRef,
      setBoardError,
      setGridContentDraftById,
      updateObjectPositionsBatch,
    ],
  );

  return { updateGridContainerDimensions };
}
