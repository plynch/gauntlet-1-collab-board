"use client";

import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import { STICKY_TEXT_SYNC_THROTTLE_MS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { BoardObject } from "@/features/boards/types";
import type {
  StickyTextSyncState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type WriteMetrics = {
  markAttempted: (channel: "sticky-text") => void;
  markSkipped: (channel: "sticky-text") => void;
  markCommitted: (channel: "sticky-text") => void;
};

type UseStickyTextSyncProps = {
  boardId: string;
  db: Firestore;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  lastStickyWriteByIdRef: MutableRefObject<Map<string, string>>;
  stickyTextSyncStateRef: MutableRefObject<Map<string, StickyTextSyncState>>;
  writeMetricsRef: MutableRefObject<WriteMetrics>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export function useStickyTextSync({
  boardId,
  db,
  canEditRef,
  objectsByIdRef,
  lastStickyWriteByIdRef,
  stickyTextSyncStateRef,
  writeMetricsRef,
  setBoardError,
}: UseStickyTextSyncProps) {
  const saveStickyText = useCallback(
    async (objectId: string, nextText: string) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("sticky-text");

      if (!canEditRef.current) {
        writeMetrics.markSkipped("sticky-text");
        return;
      }

      try {
        const normalizedText = nextText.slice(0, 1_000);
        const lastWrittenText = lastStickyWriteByIdRef.current.get(objectId);
        if (lastWrittenText === normalizedText) {
          writeMetrics.markSkipped("sticky-text");
          return;
        }

        const objectItem = objectsByIdRef.current.get(objectId);
        if (objectItem && objectItem.text === normalizedText) {
          lastStickyWriteByIdRef.current.set(objectId, normalizedText);
          writeMetrics.markSkipped("sticky-text");
          return;
        }

        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: normalizedText,
          updatedAt: serverTimestamp(),
        });
        lastStickyWriteByIdRef.current.set(objectId, normalizedText);
        const syncState = stickyTextSyncStateRef.current.get(objectId);
        if (syncState) {
          syncState.lastSentText = normalizedText;
        }
        writeMetrics.markCommitted("sticky-text");
      } catch (error) {
        console.error("Failed to update sticky text", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update sticky text."),
        );
      }
    },
    [
      boardId,
      canEditRef,
      db,
      lastStickyWriteByIdRef,
      objectsByIdRef,
      setBoardError,
      stickyTextSyncStateRef,
      writeMetricsRef,
    ],
  );

  const flushStickyTextSync = useCallback(
    (objectId: string) => {
      const syncState = stickyTextSyncStateRef.current.get(objectId);
      if (!syncState) {
        return;
      }

      if (syncState.timerId !== null) {
        window.clearTimeout(syncState.timerId);
        syncState.timerId = null;
      }

      const pendingText = syncState.pendingText;
      if (pendingText === null) {
        return;
      }

      syncState.pendingText = null;
      syncState.lastSentAt = Date.now();
      void saveStickyText(objectId, pendingText);
    },
    [saveStickyText, stickyTextSyncStateRef],
  );

  const queueStickyTextSync = useCallback(
    (objectId: string, nextText: string) => {
      if (!canEditRef.current) {
        return;
      }

      const normalizedText = nextText.slice(0, 1_000);
      const syncStates = stickyTextSyncStateRef.current;
      let syncState = syncStates.get(objectId);

      if (!syncState) {
        const objectItem = objectsByIdRef.current.get(objectId);
        syncState = {
          pendingText: null,
          lastSentAt: 0,
          lastSentText:
            lastStickyWriteByIdRef.current.get(objectId) ??
            objectItem?.text ??
            null,
          timerId: null,
        };
        syncStates.set(objectId, syncState);
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      const lastSavedText =
        syncState.lastSentText ??
        lastStickyWriteByIdRef.current.get(objectId) ??
        null;
      if (
        normalizedText === lastSavedText ||
        (objectItem && objectItem.text === normalizedText)
      ) {
        syncState.pendingText = null;
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
          syncState.timerId = null;
        }
        return;
      }

      syncState.pendingText = normalizedText;

      const now = Date.now();
      const elapsed = now - syncState.lastSentAt;

      if (elapsed >= STICKY_TEXT_SYNC_THROTTLE_MS) {
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
          syncState.timerId = null;
        }

        syncState.lastSentAt = now;
        const pendingText = syncState.pendingText;
        syncState.pendingText = null;

        if (pendingText !== null) {
          void saveStickyText(objectId, pendingText);
        }
        return;
      }

      const delay = STICKY_TEXT_SYNC_THROTTLE_MS - elapsed;
      if (syncState.timerId !== null) {
        window.clearTimeout(syncState.timerId);
      }

      syncState.timerId = window.setTimeout(() => {
        const latestSyncState = stickyTextSyncStateRef.current.get(objectId);
        if (!latestSyncState) {
          return;
        }

        latestSyncState.timerId = null;
        const pendingText = latestSyncState.pendingText;
        if (pendingText === null) {
          return;
        }

        latestSyncState.pendingText = null;
        latestSyncState.lastSentAt = Date.now();
        void saveStickyText(objectId, pendingText);
      }, delay);
    },
    [
      canEditRef,
      lastStickyWriteByIdRef,
      objectsByIdRef,
      saveStickyText,
      stickyTextSyncStateRef,
    ],
  );

  return {
    flushStickyTextSync,
    queueStickyTextSync,
  };
}
