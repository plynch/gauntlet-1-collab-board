"use client";

import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";

import type { BoardSummary } from "@/features/boards/types";
import {
  boardSortValue,
  toBoardSummary,
} from "@/features/boards/lib/live-board-utils";
import { getFirebaseClientDb } from "@/lib/firebase/client";

type UseOwnedBoardsLiveResult = {
  boards: BoardSummary[];
  boardsLoading: boolean;
  boardsError: string | null;
};

type OwnedBoardsState = {
  sourceUid: string | null;
  boards: BoardSummary[];
  boardsError: string | null;
  ready: boolean;
};

/**
 * Handles to listener error message.
 */
function toListenerErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown; message?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : null;
    const message =
      typeof candidate.message === "string" ? candidate.message : null;

    if (code && message) {
      return `${fallback} (${code}: ${message})`;
    }

    if (code) {
      return `${fallback} (${code})`;
    }

    if (message) {
      return `${fallback} (${message})`;
    }
  }

  return fallback;
}

/**
 * Handles use owned boards live.
 */
export function useOwnedBoardsLive(
  userUid: string | null,
): UseOwnedBoardsLiveResult {
  const [state, setState] = useState<OwnedBoardsState>({
    sourceUid: null,
    boards: [],
    boardsError: null,
    ready: false,
  });

  useEffect(() => {
    if (!userUid) {
      return;
    }

    const db = getFirebaseClientDb();
    const boardsQuery = query(
      collection(db, "boards"),
      where("ownerId", "==", userUid),
    );

    const unsubscribe = onSnapshot(
      boardsQuery,
      (snapshot) => {
        const nextBoards = snapshot.docs
          .map((docSnapshot) =>
            toBoardSummary(
              docSnapshot.id,
              docSnapshot.data() as Record<string, unknown>,
            ),
          )
          .sort((left, right) => boardSortValue(right) - boardSortValue(left));

        setState({
          sourceUid: userUid,
          boards: nextBoards,
          boardsError: null,
          ready: true,
        });
      },
      (error) => {
        setState({
          sourceUid: userUid,
          boards: [],
          boardsError: toListenerErrorMessage(error, "Failed to sync boards."),
          ready: true,
        });
      },
    );

    return unsubscribe;
  }, [userUid]);

  if (!userUid) {
    return {
      boards: [],
      boardsLoading: false,
      boardsError: null,
    };
  }

  if (state.sourceUid !== userUid) {
    return {
      boards: [],
      boardsLoading: true,
      boardsError: null,
    };
  }

  return {
    boards: state.boards,
    boardsLoading: !state.ready,
    boardsError: state.boardsError,
  };
}
