"use client";

import { useCallback, useRef, useMemo, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useBoardLive } from "@/features/boards/hooks/use-board-live";
import { copyBoardUrlToClipboard } from "@/features/boards/lib/board-share";
import RealtimeBoardCanvas from "@/features/boards/components/realtime-board-canvas";
import AppHeader, {
  HeaderBackLink,
} from "@/features/layout/components/app-header";

type BoardWorkspaceProps = {
  boardId: string;
};

/**
 * Handles google brand icon.
 */
function GoogleBrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.89 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.31-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.47.94 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33c.71-2.12 2.68-3.7 5.02-3.7z"
      />
    </svg>
  );
}

/**
 * Handles share board icon.
 */
function ShareBoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M9.5 3.2h3.3v3.3M8.9 7.1l3.9-3.9M7 3.2H4.6a1.8 1.8 0 0 0-1.8 1.8v6.4a1.8 1.8 0 0 0 1.8 1.8H11a1.8 1.8 0 0 0 1.8-1.8V9.8"
        stroke="#0f172a"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles board workspace.
 */
export default function BoardWorkspace({ boardId }: BoardWorkspaceProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareFeedbackTimeoutRef = useRef<number | null>(null);
  const {
    firebaseIsConfigured,
    user,
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
      setErrorMessage(
        error instanceof Error ? error.message : "Sign in failed.",
      );
    }
  }, [signInWithGoogle]);

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setSigningOut(true);

    try {
      await signOutCurrentUser();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Sign out failed.",
      );
    } finally {
      setSigningOut(false);
    }
  }, [signOutCurrentUser]);

  const combinedErrorMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }

    return boardError;
  }, [boardError, errorMessage]);

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

  if (!firebaseIsConfigured) {
    return (
      <main
        style={{
          width: "100%",
          maxWidth: "none",
          margin: 0,
          padding: "1.25rem",
          height: "100dvh",
          overflow: "hidden",
          boxSizing: "border-box",
        }}
      >
        <h1>Board</h1>
        <p>
          Firebase is not configured yet. Add your values to{" "}
          <code>.env.local</code> using <code>.env.example</code>.
        </p>
      </main>
    );
  }

  return (
    <main
      style={{
        width: "100%",
        maxWidth: "none",
        margin: 0,
        boxSizing: "border-box",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff",
      }}
    >
      <AppHeader
        user={user}
        title={board?.title ?? "CollabBoard"}
        titleAction={
          user && board && permissions?.canRead ? (
            <button
              type="button"
              onClick={() => void handleShareBoard()}
              title={shareCopied ? "Copied board URL" : "Share board"}
              aria-label={shareCopied ? "Copied board URL" : "Share board"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-900"
            >
              <ShareBoardIcon />
            </button>
          ) : undefined
        }
        leftSlot={
          user ? (
            <HeaderBackLink href="/" label="Back to My Boards" />
          ) : undefined
        }
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "hidden",
          display: "flex",
          position: "relative",
        }}
      >
        {authLoading ? (
          <div style={{ margin: "auto", color: "#475569" }}>
            Checking authentication...
          </div>
        ) : null}

        {!authLoading && !user ? (
          <section
            style={{
              width: "min(100%, 460px)",
              margin: "auto",
              display: "grid",
              justifyItems: "center",
              textAlign: "center",
              gap: "0.8rem",
            }}
          >
            <p style={{ margin: 0 }}>Sign in to access this board.</p>
            <button
              type="button"
              onClick={() => void handleSignIn()}
              style={{
                height: 40,
                borderRadius: 999,
                border: "1px solid #dadce0",
                background: "white",
                color: "#3c4043",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.6rem",
                padding: "0 0.95rem",
                fontWeight: 500,
                fontSize: 14,
                cursor: "pointer",
                boxShadow: "0 1px 2px rgba(60,64,67,0.2)",
              }}
            >
              <GoogleBrandIcon />
              <span>Sign in with Google</span>
            </button>
          </section>
        ) : null}

        {combinedErrorMessage ? (
          <p
            style={{
              color: "#b91c1c",
              margin: 0,
              position: "absolute",
              left: 12,
              top: 68,
              zIndex: 10,
            }}
          >
            {combinedErrorMessage}
          </p>
        ) : null}

        {!authLoading && user ? (
          <>
            {boardLoading ? (
              <div style={{ margin: "auto", color: "#475569" }}>
                Loading board...
              </div>
            ) : null}

            {!boardLoading && board && permissions?.canRead ? (
              <div style={{ height: "100%", minHeight: 0, flex: 1 }}>
                <RealtimeBoardCanvas
                  boardId={boardId}
                  user={user}
                  permissions={permissions}
                />
              </div>
            ) : null}

            {!boardLoading && board && permissions && !permissions.canRead ? (
              <p style={{ margin: "auto" }}>
                You do not have access to this board.
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
