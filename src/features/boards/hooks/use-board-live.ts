"use client";

import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";

import type { BoardPermissions } from "@/features/boards/types";
import {
  getBoardPermissions,
  toLiveBoardDetail,
  type LiveBoardDetail,
} from "@/features/boards/lib/live-board-utils";
import { getFirebaseClientDb } from "@/lib/firebase/client";

type UseBoardLiveResult = {
  board: LiveBoardDetail | null;
  permissions: BoardPermissions | null;
  boardLoading: boolean;
  boardError: string | null;
};

type LiveBoardState = {
  sourceKey: string | null;
  board: LiveBoardDetail | null;
  permissions: BoardPermissions | null;
  boardError: string | null;
  ready: boolean;
};

function toListenerErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { code?: unknown };
    const code = typeof candidate.code === "string" ? candidate.code : null;

    if (code === "permission-denied") {
      return "You no longer have access to this board.";
    }

    if (code === "unauthenticated") {
      return "Your session expired. Please sign in again.";
    }

    if (code === "unavailable" || code === "deadline-exceeded") {
      return "Board sync is temporarily unavailable. Please try again.";
    }
  }

  return fallback;
}

export function useBoardLive(
  boardId: string,
  userUid: string | null,
): UseBoardLiveResult {
  const [state, setState] = useState<LiveBoardState>({
    sourceKey: null,
    board: null,
    permissions: null,
    boardError: null,
    ready: false,
  });

  useEffect(() => {
    if (!userUid) {
      return;
    }

    const sourceKey = `${boardId}:${userUid}`;
    const boardRef = doc(getFirebaseClientDb(), `boards/${boardId}`);
    const unsubscribe = onSnapshot(
      boardRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          setState({
            sourceKey,
            board: null,
            permissions: null,
            boardError: "Board not found.",
            ready: true,
          });
          return;
        }

        const parsedBoard = toLiveBoardDetail(
          snapshot.id,
          snapshot.data() as Record<string, unknown>,
        );
        if (!parsedBoard) {
          setState({
            sourceKey,
            board: null,
            permissions: null,
            boardError: "Board data is invalid.",
            ready: true,
          });
          return;
        }

        setState({
          sourceKey,
          board: parsedBoard,
          permissions: getBoardPermissions(parsedBoard, userUid),
          boardError: null,
          ready: true,
        });
      },
      (error) => {
        setState({
          sourceKey,
          board: null,
          permissions: null,
          boardError: toListenerErrorMessage(error, "Failed to sync board."),
          ready: true,
        });
      },
    );

    return unsubscribe;
  }, [boardId, userUid]);

  if (!userUid) {
    return {
      board: null,
      permissions: null,
      boardLoading: false,
      boardError: null,
    };
  }

  const sourceKey = `${boardId}:${userUid}`;
  if (state.sourceKey !== sourceKey) {
    return {
      board: null,
      permissions: null,
      boardLoading: true,
      boardError: null,
    };
  }

  return {
    board: state.board,
    permissions: state.permissions,
    boardLoading: !state.ready,
    boardError: state.boardError,
  };
}
