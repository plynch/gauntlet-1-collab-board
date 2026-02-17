"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useBoardLive } from "@/features/boards/hooks/use-board-live";
import RealtimeBoardCanvas from "@/features/boards/components/realtime-board-canvas";

type BoardWorkspaceProps = {
  boardId: string;
};

export default function BoardWorkspace({ boardId }: BoardWorkspaceProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    firebaseIsConfigured,
    user,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser
  } = useAuthSession();
  const { board, permissions, boardLoading, boardError } = useBoardLive(
    boardId,
    user?.uid ?? null
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
    await signOutCurrentUser();
  }, [signOutCurrentUser]);

  const combinedErrorMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }

    return boardError;
  }, [boardError, errorMessage]);

  if (!firebaseIsConfigured) {
    return (
      <main
        style={{
          width: "100%",
          maxWidth: "none",
          margin: 0,
          padding: "1rem 1.25rem",
          height: "100vh",
          overflow: "hidden",
          boxSizing: "border-box"
        }}
      >
        <h1>Board</h1>
        <p>
          Firebase is not configured yet. Add your values to <code>.env.local</code>{" "}
          using <code>.env.example</code>.
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
        padding: "1rem 1.25rem",
        boxSizing: "border-box",
        height: "100vh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column"
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "1rem"
        }}
      >
        <div>
          <p style={{ margin: 0 }}>
            <Link href="/">Back to boards</Link>
          </p>
          <h1 style={{ margin: "0.3rem 0 0" }}>
            {board?.title ?? "Board"}{" "}
            <span style={{ color: "#6b7280", fontWeight: 400 }}>({boardId})</span>
          </h1>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {permissions?.isOwner ? (
            <Link href={`/boards/${boardId}/settings`}>Manage access</Link>
          ) : null}
          {user ? (
            <button type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          ) : null}
        </div>
      </header>

      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {authLoading ? <p>Checking authentication...</p> : null}

        {!authLoading && !user ? (
          <section>
            <p>Sign in to access this board.</p>
            <button type="button" onClick={() => void handleSignIn()}>
              Sign in with Google
            </button>
          </section>
        ) : null}

        {combinedErrorMessage ? (
          <p style={{ color: "#b91c1c", marginTop: "1rem" }}>{combinedErrorMessage}</p>
        ) : null}

        {!authLoading && user ? (
          <>
            {boardLoading ? <p>Loading board...</p> : null}

            {!boardLoading && board && permissions?.canRead ? (
              <div style={{ height: "100%", minHeight: 0 }}>
                <RealtimeBoardCanvas
                  boardId={boardId}
                  user={user}
                  permissions={permissions}
                />
              </div>
            ) : null}

            {!boardLoading && board && permissions && !permissions.canRead ? (
              <p>You do not have access to this board.</p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
