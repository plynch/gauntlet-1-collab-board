"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import BoardCanvasErrorBoundary from "@/features/boards/components/board-canvas-error-boundary";
import {
  EditIcon,
  ShareBoardIcon,
  titleActionButtonStyle,
} from "@/features/boards/components/board-workspace-icons";
import {
  BoardErrorAlert,
  FirebaseConfigMissingPanel,
  SignInPrompt,
  StatusLabel,
} from "@/features/boards/components/board-workspace-panels";
import RealtimeBoardCanvas from "@/features/boards/components/realtime-board-canvas";
import { useBoardLive } from "@/features/boards/hooks/use-board-live";
import { copyBoardUrlToClipboard } from "@/features/boards/lib/board-share";
import AppHeader, {
  HeaderBackLink,
} from "@/features/layout/components/app-header";

type BoardWorkspaceProps = {
  boardId: string;
};

type UpdateBoardResponse = {
  board: {
    id: string;
    title: string;
  };
};

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null && "error" in payload) {
    const message = (payload as { error?: unknown }).error;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function isBoardAccessDeniedMessage(message: string): boolean {
  return message.toLowerCase().includes("no longer have access");
}

export default function BoardWorkspace({ boardId }: BoardWorkspaceProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [renamingBoard, setRenamingBoard] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareFeedbackTimeoutRef = useRef<number | null>(null);
  const {
    firebaseIsConfigured,
    user,
    idToken,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser,
  } = useAuthSession();
  const { board, permissions, boardLoading, boardError } = useBoardLive(
    boardId,
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

  const combinedErrorMessage = useMemo(
    () => errorMessage ?? boardError ?? null,
    [boardError, errorMessage],
  );
  const isAccessDeniedError = useMemo(
    () =>
      combinedErrorMessage
        ? isBoardAccessDeniedMessage(combinedErrorMessage)
        : false,
    [combinedErrorMessage],
  );

  const handleShareBoard = useCallback(async () => {
    setErrorMessage(null);
    try {
      await copyBoardUrlToClipboard(boardId, window.location.origin);
      setShareCopied(true);
      if (shareFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(shareFeedbackTimeoutRef.current);
      }
      shareFeedbackTimeoutRef.current = window.setTimeout(() => {
        setShareCopied(false);
      }, 1_800);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to copy board URL.",
      );
    }
  }, [boardId]);

  const handleRenameBoard = useCallback(async () => {
    if (!idToken || !board) {
      return;
    }

    const nextTitleRaw = window.prompt("Rename board", board.title);
    if (nextTitleRaw === null) {
      return;
    }

    const nextTitle = nextTitleRaw.trim();
    if (nextTitle.length === 0) {
      setErrorMessage("Board title is required.");
      return;
    }
    if (nextTitle === board.title) {
      return;
    }

    setErrorMessage(null);
    setRenamingBoard(true);
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
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to rename board.",
      );
    } finally {
      setRenamingBoard(false);
    }
  }, [board, boardId, idToken]);

  if (!firebaseIsConfigured) {
    return <FirebaseConfigMissingPanel />;
  }

  return (
    <main style={mainStyle}>
      <AppHeader
        user={user}
        title={board?.title ?? "CollabBoard"}
        titleAction={
          user && board && permissions?.canRead ? (
            <span className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleRenameBoard()}
                title={renamingBoard ? "Renaming..." : "Rename board"}
                aria-label={`Rename board ${board.title}`}
                disabled={renamingBoard}
                style={{ ...titleActionButtonStyle, opacity: renamingBoard ? 0.75 : 1 }}
              >
                <EditIcon />
              </button>
              <button
                type="button"
                onClick={() => void handleShareBoard()}
                title={shareCopied ? "Copied board URL" : "Share board"}
                aria-label={shareCopied ? "Copied board URL" : "Share board"}
                style={titleActionButtonStyle}
              >
                <ShareBoardIcon />
              </button>
            </span>
          ) : undefined
        }
        leftSlot={
          user ? <HeaderBackLink href="/" label="Back to My Boards" /> : undefined
        }
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
      />

      <div style={contentShellStyle}>
        {authLoading ? <StatusLabel text="Checking authentication..." /> : null}
        {!authLoading && !user ? (
          <SignInPrompt onSignIn={() => void handleSignIn()} />
        ) : null}
        {combinedErrorMessage ? (
          <BoardErrorAlert
            message={combinedErrorMessage}
            accessDenied={isAccessDeniedError}
            onGoToBoards={() => router.push("/")}
            onRetry={() => window.location.reload()}
          />
        ) : null}
        {!authLoading && user ? (
          <>
            {boardLoading ? <StatusLabel text="Loading board..." /> : null}
            {!boardLoading && board && permissions?.canRead ? (
              <div style={canvasRootStyle}>
                <BoardCanvasErrorBoundary onBackToBoards={() => router.push("/")}>
                  <RealtimeBoardCanvas
                    boardId={boardId}
                    user={user}
                    permissions={permissions}
                  />
                </BoardCanvasErrorBoundary>
              </div>
            ) : null}
            {!boardLoading && board && permissions && !permissions.canRead ? (
              <p style={{ margin: "auto" }}>You do not have access to this board.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}

const mainStyle = {
  width: "100%",
  maxWidth: "none",
  margin: 0,
  boxSizing: "border-box",
  height: "100dvh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
  color: "var(--text)",
} as const;

const contentShellStyle = {
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  position: "relative",
} as const;

const canvasRootStyle = { height: "100%", minHeight: 0, flex: 1 } as const;
