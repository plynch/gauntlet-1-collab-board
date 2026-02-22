import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useOwnedBoardsLive } from "@/features/boards/hooks/use-owned-boards-live";
import { copyBoardUrlToClipboard } from "@/features/boards/lib/board-share";
import type { BoardSummary } from "@/features/boards/types";

type CreateBoardResponse = { board: BoardSummary };
type UpdateBoardResponse = { board: BoardSummary };

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return fallback;
}

export function useBoardsPageState() {
  const [showCreateBoardForm, setShowCreateBoardForm] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [renameBoardTitle, setRenameBoardTitle] = useState("");
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [sharedBoardId, setSharedBoardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const shareFeedbackTimeoutRef = useRef<number | null>(null);
  const createBoardTitleInputRef = useRef<HTMLInputElement | null>(null);

  const {
    firebaseIsConfigured,
    user,
    idToken,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser,
  } = useAuthSession();
  const { boards, boardsLoading, boardsError } = useOwnedBoardsLive(
    user?.uid ?? null,
  );

  const handleSignIn = useCallback(async () => {
    setErrorMessage(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    }
  }, [signInWithGoogle]);

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setSigningOut(true);
    try {
      await signOutCurrentUser();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign out failed.");
    } finally {
      setSigningOut(false);
    }
  }, [signOutCurrentUser]);

  const handleCreateBoard = useCallback(async () => {
    if (!idToken) {
      return;
    }
    const title = newBoardTitle.trim();
    if (!title) {
      setErrorMessage("Board title is required.");
      return;
    }

    setCreatingBoard(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title }),
      });

      const payload = (await response.json()) as
        | CreateBoardResponse
        | { error?: string };
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Failed to create board."));
      }
      if (!("board" in payload)) {
        throw new Error("Malformed create board response.");
      }
      setNewBoardTitle("");
      setShowCreateBoardForm(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board.");
    } finally {
      setCreatingBoard(false);
    }
  }, [idToken, newBoardTitle]);

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      if (!idToken || !window.confirm("Delete this board? This cannot be undone.")) {
        return;
      }
      setDeletingBoardId(boardId);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/boards/${boardId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const payload = (await response.json()) as { error?: string; ok?: boolean };
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Failed to delete board."));
        }
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete board.");
      } finally {
        setDeletingBoardId(null);
      }
    },
    [idToken],
  );

  const handleStartRenameBoard = useCallback((board: BoardSummary) => {
    setErrorMessage(null);
    setEditingBoardId(board.id);
    setRenameBoardTitle(board.title);
  }, []);

  const handleCancelRenameBoard = useCallback(() => {
    if (!renamingBoardId) {
      setEditingBoardId(null);
      setRenameBoardTitle("");
    }
  }, [renamingBoardId]);

  const handleRenameBoardSubmit = useCallback(
    async (boardId: string) => {
      if (!idToken) {
        return;
      }
      const nextTitle = renameBoardTitle.trim();
      if (!nextTitle.length) {
        setErrorMessage("Board title is required.");
        return;
      }

      setRenamingBoardId(boardId);
      setErrorMessage(null);
      try {
        const response = await fetch(`/api/boards/${boardId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title: nextTitle }),
        });
        const payload = (await response.json()) as
          | UpdateBoardResponse
          | { error?: string };
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Failed to rename board."));
        }
        if (!("board" in payload)) {
          throw new Error("Malformed rename board response.");
        }
        setEditingBoardId(null);
        setRenameBoardTitle("");
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to rename board.");
      } finally {
        setRenamingBoardId(null);
      }
    },
    [idToken, renameBoardTitle],
  );

  const handleShareBoard = useCallback(async (boardId: string) => {
    setErrorMessage(null);
    try {
      await copyBoardUrlToClipboard(boardId, window.location.origin);
      setSharedBoardId(boardId);
      if (shareFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(shareFeedbackTimeoutRef.current);
      }
      shareFeedbackTimeoutRef.current = window.setTimeout(() => {
        setSharedBoardId((currentValue) => (currentValue === boardId ? null : currentValue));
      }, 1_800);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to copy board link.");
    }
  }, []);

  const combinedErrorMessage = useMemo(
    () => errorMessage ?? boardsError ?? null,
    [boardsError, errorMessage],
  );

  useEffect(() => {
    if (!showCreateBoardForm || creatingBoard) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      createBoardTitleInputRef.current?.focus();
      createBoardTitleInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [creatingBoard, showCreateBoardForm]);

  return {
    authLoading,
    boards,
    boardsLoading,
    combinedErrorMessage,
    createBoardTitleInputRef,
    creatingBoard,
    deletingBoardId,
    editingBoardId,
    errorMessage,
    firebaseIsConfigured,
    handleCancelRenameBoard,
    handleCreateBoard,
    handleDeleteBoard,
    handleRenameBoardSubmit,
    handleShareBoard,
    handleSignIn,
    handleSignOut,
    handleStartRenameBoard,
    idToken,
    newBoardTitle,
    renameBoardTitle,
    renamingBoardId,
    setEditingBoardId,
    setErrorMessage,
    setNewBoardTitle,
    setRenameBoardTitle,
    setShowCreateBoardForm,
    sharedBoardId,
    showCreateBoardForm,
    signingOut,
    user,
  };
}
