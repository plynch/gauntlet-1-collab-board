"use client";

import {
  useCallback,
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import type { BoardObject } from "@/features/boards/types";
import type { PresenceUser } from "@/features/boards/types";
import {
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { getRenderLayerRank } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { PRESENCE_HEARTBEAT_MS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { toBoardObject } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import { toPresenceUser } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import { GRID_CONTAINER_DEFAULT_GAP } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { BoardPoint } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { CollectionReference } from "firebase/firestore";
import type { DocumentData, DocumentReference } from "firebase/firestore";

type RealtimeBoardCanvasSubscriptionSyncProps = {
  boardId: string;
  user: {
    uid: string;
    displayName: string | null;
    email: string | null;
    getIdToken: () => Promise<string>;
  };
  boardColor: string;
  objectsCollectionRef: CollectionReference<DocumentData>;
  presenceCollectionRef: CollectionReference<DocumentData>;
  selfPresenceRef: DocumentReference<DocumentData>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  setObjects: Dispatch<SetStateAction<BoardObject[]>>;
  setPresenceUsers: Dispatch<SetStateAction<PresenceUser[]>>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
  lastCursorWriteRef: MutableRefObject<BoardPoint | null>;
  idTokenRef: MutableRefObject<string | null>;
};

export function useRealtimeBoardCanvasSubscriptionSync({
  boardId,
  user,
  boardColor,
  objectsCollectionRef,
  presenceCollectionRef,
  selfPresenceRef,
  setSelectedObjectIds,
  setObjects,
  setPresenceUsers,
  setBoardError,
  lastCursorWriteRef,
  idTokenRef,
}: RealtimeBoardCanvasSubscriptionSyncProps) {
  useEffect(() => {
    let cancelled = false;

    const refreshIdToken = async () => {
      try {
        const token = await user.getIdToken();
        if (!cancelled) {
          idTokenRef.current = token;
        }
      } catch {
        if (!cancelled) {
          idTokenRef.current = null;
        }
      }
    };

    void refreshIdToken();
    const refreshInterval = window.setInterval(() => {
      void refreshIdToken();
    }, 10 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [idTokenRef, user]);

  const pushPresencePatchToApi = useCallback(
    (
      payload: {
        active: boolean;
        cursorX: number | null;
        cursorY: number | null;
      },
      keepalive: boolean,
    ) => {
      const idToken = idTokenRef.current;
      if (!idToken) {
        return;
      }

      void fetch(`/api/boards/${boardId}/presence`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive,
      }).catch(() => {
        // Best-effort fallback for tab close/navigation transitions.
      });
    },
    [boardId, idTokenRef],
  );

  const markPresenceInactive = useCallback(
    (keepalive: boolean) => {
      lastCursorWriteRef.current = null;

      const payload = {
        active: false,
        cursorX: null,
        cursorY: null,
      };

      void setDoc(
        selfPresenceRef,
        {
          ...payload,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {
        // Ignore write failures during navigation/tab close.
      });

      pushPresencePatchToApi(payload, keepalive);
    },
    [lastCursorWriteRef, pushPresencePatchToApi, selfPresenceRef],
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      objectsCollectionRef,
      (snapshot) => {
        const nextObjects: BoardObject[] = [];
        snapshot.docs.forEach((documentSnapshot) => {
          const parsed = toBoardObject(
            documentSnapshot.id,
            documentSnapshot.data() as Record<string, unknown>,
            {
              gridContainerMaxRows: GRID_CONTAINER_MAX_ROWS,
              gridContainerMaxCols: GRID_CONTAINER_MAX_COLS,
              gridContainerDefaultGap: GRID_CONTAINER_DEFAULT_GAP,
            },
          );
          if (parsed) {
            nextObjects.push(parsed);
          }
        });

        nextObjects.sort((left, right) => {
          const leftRank = getRenderLayerRank(left.type);
          const rightRank = getRenderLayerRank(right.type);
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          if (left.zIndex !== right.zIndex) {
            return left.zIndex - right.zIndex;
          }

          return left.id.localeCompare(right.id);
        });

        const nextObjectIds = new Set(nextObjects.map((objectItem) => objectItem.id));
        setSelectedObjectIds((previous) =>
          previous.filter((objectId) => nextObjectIds.has(objectId)),
        );

        setObjects(nextObjects);
      },
      (error) => {
        console.error("Failed to sync board objects", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to sync board objects."),
        );
      },
    );

    return unsubscribe;
  }, [objectsCollectionRef, setSelectedObjectIds, setObjects, setBoardError]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      presenceCollectionRef,
      (snapshot) => {
        const users = snapshot.docs.map((documentSnapshot) =>
          toPresenceUser(
            documentSnapshot.id,
            documentSnapshot.data({
              serverTimestamps: "estimate",
            }) as Record<string, unknown>,
          ),
        );
        setPresenceUsers(users);
      },
      (error) => {
        console.error("Failed to sync presence", error);
      },
    );

    return unsubscribe;
  }, [presenceCollectionRef, setPresenceUsers]);

  useEffect(() => {
    const setPresenceState = async (
      cursor: BoardPoint | null,
      active: boolean,
    ) => {
      await setDoc(
        selfPresenceRef,
        {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null,
          color: boardColor,
          cursorX: cursor?.x ?? null,
          cursorY: cursor?.y ?? null,
          active,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      );
    };

    void setPresenceState(null, true);

    const heartbeatInterval = window.setInterval(() => {
      void setPresenceState(null, true);
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeatInterval);
      markPresenceInactive(false);
    };
  }, [
    boardColor,
    markPresenceInactive,
    selfPresenceRef,
    user.displayName,
    user.email,
    user.uid,
  ]);

  useEffect(() => {
    const handlePageHide = () => {
      markPresenceInactive(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [markPresenceInactive]);
}
