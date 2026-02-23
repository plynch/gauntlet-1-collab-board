"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  STICKY_TEXT_SYNC_THROTTLE_MS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  getDefaultSectionTitles,
  normalizeSectionValues,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";
import type {
  GridContainerContentDraft,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";

type UseGridContentSyncProps = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  gridContentDraftByIdRef: MutableRefObject<
    Record<string, GridContainerContentDraft>
  >;
  gridContentSyncTimerByIdRef: MutableRefObject<Map<string, number>>;
  setGridContentDraftById: Dispatch<
    SetStateAction<Record<string, GridContainerContentDraft>>
  >;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export function useGridContentSync({
  boardId,
  db,
  canEditRef,
  objectsByIdRef,
  gridContentDraftByIdRef,
  gridContentSyncTimerByIdRef,
  setGridContentDraftById,
  setBoardError,
}: UseGridContentSyncProps) {
  const buildGridDraft = useCallback(
    (objectItem: BoardObject): GridContainerContentDraft => {
      const rows = Math.max(1, objectItem.gridRows ?? 2);
      const cols = Math.max(1, objectItem.gridCols ?? 2);
      const sectionCount = rows * cols;
      const defaultSectionTitles = getDefaultSectionTitles(rows, cols);
      return {
        containerTitle: (objectItem.containerTitle ?? "").slice(0, 120),
        sectionTitles: normalizeSectionValues(
          objectItem.gridSectionTitles,
          sectionCount,
          (index) => defaultSectionTitles[index] ?? `Section ${index + 1}`,
          80,
        ),
        sectionNotes: normalizeSectionValues(
          objectItem.gridSectionNotes,
          sectionCount,
          () => "",
          600,
        ),
      };
    },
    [],
  );

  const getGridDraftForObject = useCallback(
    (objectItem: BoardObject): GridContainerContentDraft => {
      const existing = gridContentDraftByIdRef.current[objectItem.id];
      if (existing) {
        return existing;
      }

      return buildGridDraft(objectItem);
    },
    [buildGridDraft, gridContentDraftByIdRef],
  );

  const flushGridContentSync = useCallback(
    async (objectId: string, nextDraft?: GridContainerContentDraft) => {
      if (!canEditRef.current) {
        return;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "gridContainer") {
        return;
      }

      const draft = nextDraft ?? gridContentDraftByIdRef.current[objectId];
      if (!draft) {
        return;
      }

      const normalizedDraft: GridContainerContentDraft = {
        containerTitle: draft.containerTitle.trim().slice(0, 120),
        sectionTitles: draft.sectionTitles.map((value, index) => {
          const trimmed = value.trim();
          return (trimmed.length > 0 ? trimmed : `Section ${index + 1}`).slice(
            0,
            80,
          );
        }),
        sectionNotes: draft.sectionNotes.map((value) => value.slice(0, 600)),
      };

      const latestObject = objectsByIdRef.current.get(objectId);
      if (!latestObject || latestObject.type !== "gridContainer") {
        return;
      }
      const latestBaseline = buildGridDraft(latestObject);
      const hasNoopWrite =
        latestBaseline.containerTitle === normalizedDraft.containerTitle &&
        JSON.stringify(latestBaseline.sectionTitles) ===
          JSON.stringify(normalizedDraft.sectionTitles) &&
        JSON.stringify(latestBaseline.sectionNotes) ===
          JSON.stringify(normalizedDraft.sectionNotes);
      if (hasNoopWrite) {
        return;
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          containerTitle: normalizedDraft.containerTitle,
          gridSectionTitles: normalizedDraft.sectionTitles,
          gridSectionNotes: normalizedDraft.sectionNotes,
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
      } catch (error) {
        console.error("Failed to update grid container content", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update grid container content.",
          ),
        );
      }
    },
    [
      boardId,
      buildGridDraft,
      canEditRef,
      db,
      gridContentDraftByIdRef,
      objectsByIdRef,
      setBoardError,
      setGridContentDraftById,
    ],
  );

  const queueGridContentSync = useCallback(
    (
      objectId: string,
      nextDraft: GridContainerContentDraft,
      options?: { immediate?: boolean },
    ) => {
      setGridContentDraftById((previous) => ({
        ...previous,
        [objectId]: nextDraft,
      }));

      const existingTimer = gridContentSyncTimerByIdRef.current.get(objectId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }

      if (options?.immediate) {
        gridContentSyncTimerByIdRef.current.delete(objectId);
        void flushGridContentSync(objectId, nextDraft);
        return;
      }

      const nextTimerId = window.setTimeout(() => {
        gridContentSyncTimerByIdRef.current.delete(objectId);
        void flushGridContentSync(objectId, nextDraft);
      }, STICKY_TEXT_SYNC_THROTTLE_MS);
      gridContentSyncTimerByIdRef.current.set(objectId, nextTimerId);
    },
    [flushGridContentSync, gridContentSyncTimerByIdRef, setGridContentDraftById],
  );

  const saveGridContainerCellColors = useCallback(
    (objectId: string, nextColors: string[]) => {
      void updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
        gridCellColors: nextColors,
        updatedAt: serverTimestamp(),
      }).catch((error) => {
        console.error("Failed to update grid container colors", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update grid container colors."),
        );
      });
    },
    [boardId, db, setBoardError],
  );

  return {
    buildGridDraft,
    getGridDraftForObject,
    flushGridContentSync,
    queueGridContentSync,
    saveGridContainerCellColors,
  };
}
