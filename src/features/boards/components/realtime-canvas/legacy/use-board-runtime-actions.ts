import { useCallback, type MutableRefObject } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  serverTimestamp,
  setDoc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  getDistance,
  toWritePoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { CURSOR_MIN_MOVE_DISTANCE } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  BoardPoint,
  GridContainerContentDraft,
  ObjectGeometry,
  StickyTextSyncState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { createBoardObjectAction } from "@/features/boards/components/realtime-canvas/legacy/create-board-object-action";
import { createSwotTemplateAction } from "@/features/boards/components/realtime-canvas/legacy/swot-template-action";
import { deleteBoardObjectAction } from "@/features/boards/components/realtime-canvas/legacy/delete-board-object-action";
import type { RealtimeWriteMetricsCollector } from "@/features/boards/lib/realtime-write-metrics";

type UseBoardRuntimeActionsArgs = {
  boardId: string;
  db: Firestore;
  canEdit: boolean;
  userId: string;
  objectsCollectionRef: CollectionReference<DocumentData>;
  selfPresenceRef: DocumentReference<DocumentData>;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportState>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  objectSpawnSequenceRef: MutableRefObject<number>;
  snapToGridEnabledRef: MutableRefObject<boolean>;
  stickyTextSyncStateRef: MutableRefObject<Map<string, StickyTextSyncState>>;
  lastStickyWriteByIdRef: MutableRefObject<Map<string, string>>;
  lastPositionWriteByIdRef: MutableRefObject<Map<string, BoardPoint>>;
  lastGeometryWriteByIdRef: MutableRefObject<Map<string, ObjectGeometry>>;
  gridContentSyncTimerByIdRef: MutableRefObject<Map<string, number>>;
  lastCursorWriteRef: MutableRefObject<BoardPoint | null>;
  writeMetricsRef: MutableRefObject<RealtimeWriteMetricsCollector>;
  setGridContentDraftById: Dispatch<
    SetStateAction<Record<string, GridContainerContentDraft>>
  >;
  setTextDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  clearDraftConnector: (objectId: string) => void;
  setBoardError: Dispatch<SetStateAction<string | null>>;
  setBoardStatusMessage: Dispatch<SetStateAction<string | null>>;
  boardStatusTimerRef: MutableRefObject<number | null>;
};

export function useBoardRuntimeActions({
  boardId,
  db,
  canEdit,
  userId,
  objectsCollectionRef,
  selfPresenceRef,
  stageRef,
  viewportRef,
  objectsByIdRef,
  objectSpawnSequenceRef,
  snapToGridEnabledRef,
  stickyTextSyncStateRef,
  lastStickyWriteByIdRef,
  lastPositionWriteByIdRef,
  lastGeometryWriteByIdRef,
  gridContentSyncTimerByIdRef,
  lastCursorWriteRef,
  writeMetricsRef,
  setGridContentDraftById,
  setTextDrafts,
  setSelectedObjectIds,
  clearDraftConnector,
  setBoardError,
  setBoardStatusMessage,
  boardStatusTimerRef,
}: UseBoardRuntimeActionsArgs) {
  const updateCursor = useCallback(
    async (cursor: BoardPoint | null, options: { force?: boolean } = {}) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("cursor");

      const force = options.force ?? false;
      const nextCursor = cursor ? toWritePoint(cursor) : null;
      const previousCursor = lastCursorWriteRef.current;

      if (!force) {
        if (nextCursor === null && previousCursor === null) {
          writeMetrics.markSkipped("cursor");
          return;
        }

        if (
          nextCursor !== null &&
          previousCursor !== null &&
          getDistance(nextCursor, previousCursor) < CURSOR_MIN_MOVE_DISTANCE
        ) {
          writeMetrics.markSkipped("cursor");
          return;
        }
      }

      try {
        await setDoc(
          selfPresenceRef,
          {
            cursorX: nextCursor?.x ?? null,
            cursorY: nextCursor?.y ?? null,
            active: true,
            lastSeenAtMs: Date.now(),
            lastSeenAt: serverTimestamp(),
          },
          { merge: true },
        );
        lastCursorWriteRef.current = nextCursor;
        writeMetrics.markCommitted("cursor");
      } catch {
        // Ignore cursor write failures to avoid interrupting interactions.
      }
    },
    [lastCursorWriteRef, selfPresenceRef, writeMetricsRef],
  );

  const createObject = useCallback(
    async (kind: BoardObjectKind) => {
      await createBoardObjectAction({
        kind,
        canEdit,
        userId,
        objectsCollectionRef,
        objectsByIdRef,
        objectSpawnSequenceRef,
        stageRef,
        viewportRef,
        snapToGridEnabledRef,
        setBoardError,
      });
    },
    [
      canEdit,
      objectsByIdRef,
      objectSpawnSequenceRef,
      objectsCollectionRef,
      setBoardError,
      snapToGridEnabledRef,
      stageRef,
      userId,
      viewportRef,
    ],
  );

  const showBoardStatus = useCallback(
    (message: string) => {
      setBoardStatusMessage(message);
      if (boardStatusTimerRef.current !== null) {
        window.clearTimeout(boardStatusTimerRef.current);
      }
      boardStatusTimerRef.current = window.setTimeout(() => {
        setBoardStatusMessage(null);
        boardStatusTimerRef.current = null;
      }, 2400);
    },
    [boardStatusTimerRef, setBoardStatusMessage],
  );

  const createSwotTemplate = useCallback(async () => {
    return createSwotTemplateAction({
      canEdit,
      stageRef,
      viewportRef,
      objectsByIdRef,
      objectSpawnSequenceRef,
      snapToGridEnabledRef,
      objectsCollectionRef,
      userId,
      setBoardError,
    });
  }, [
    canEdit,
    objectSpawnSequenceRef,
    objectsByIdRef,
    objectsCollectionRef,
    setBoardError,
    snapToGridEnabledRef,
    stageRef,
    userId,
    viewportRef,
  ]);

  const deleteObject = useCallback(
    async (objectId: string) => {
      if (!canEdit) {
        return;
      }

      await deleteBoardObjectAction({
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
      });
    },
    [
      boardId,
      canEdit,
      clearDraftConnector,
      db,
      gridContentSyncTimerByIdRef,
      lastGeometryWriteByIdRef,
      lastPositionWriteByIdRef,
      lastStickyWriteByIdRef,
      setBoardError,
      setGridContentDraftById,
      setSelectedObjectIds,
      setTextDrafts,
      stickyTextSyncStateRef,
    ],
  );

  return {
    updateCursor,
    createObject,
    showBoardStatus,
    createSwotTemplate,
    deleteObject,
  };
}
