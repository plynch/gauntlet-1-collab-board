"use client";

import { deleteDoc, doc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import type {
  BoardPoint,
  GridContainerContentDraft,
  ObjectGeometry,
  StickyTextSyncState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type DeleteBoardObjectActionParams = {
  db: Firestore;
  boardId: string;
  objectId: string;
  stickyTextSyncStateRef: MutableRefObject<Map<string, StickyTextSyncState>>;
  lastStickyWriteByIdRef: MutableRefObject<Map<string, string>>;
  lastPositionWriteByIdRef: MutableRefObject<Map<string, BoardPoint>>;
  lastGeometryWriteByIdRef: MutableRefObject<Map<string, ObjectGeometry>>;
  gridContentSyncTimerByIdRef: MutableRefObject<Map<string, number>>;
  setGridContentDraftById: Dispatch<
    SetStateAction<Record<string, GridContainerContentDraft>>
  >;
  setTextDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  clearDraftConnector: (objectId: string) => void;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export async function deleteBoardObjectAction({
  db,
  boardId,
  objectId,
  stickyTextSyncStateRef,
  lastStickyWriteByIdRef,
  lastPositionWriteByIdRef,
  lastGeometryWriteByIdRef,
  gridContentSyncTimerByIdRef,
  setGridContentDraftById,
  setTextDrafts,
  setSelectedObjectIds,
  clearDraftConnector,
  setBoardError,
}: DeleteBoardObjectActionParams): Promise<void> {
  try {
    await deleteDoc(doc(db, `boards/${boardId}/objects/${objectId}`));
    const syncState = stickyTextSyncStateRef.current.get(objectId);
    if (syncState && syncState.timerId !== null) {
      window.clearTimeout(syncState.timerId);
    }
    stickyTextSyncStateRef.current.delete(objectId);
    lastStickyWriteByIdRef.current.delete(objectId);
    lastPositionWriteByIdRef.current.delete(objectId);
    lastGeometryWriteByIdRef.current.delete(objectId);
    const gridTimerId = gridContentSyncTimerByIdRef.current.get(objectId);
    if (gridTimerId !== undefined) {
      window.clearTimeout(gridTimerId);
      gridContentSyncTimerByIdRef.current.delete(objectId);
    }
    setGridContentDraftById((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
    setTextDrafts((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
    setSelectedObjectIds((previous) => previous.filter((id) => id !== objectId));
    clearDraftConnector(objectId);
  } catch (error) {
    console.error("Failed to delete object", error);
    setBoardError(toBoardErrorMessage(error, "Failed to delete object."));
  }
}
