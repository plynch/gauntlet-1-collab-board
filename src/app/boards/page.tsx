"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type CSSProperties } from "react";

import { MAX_OWNED_BOARDS, type BoardSummary } from "@/features/boards/types";
import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useOwnedBoardsLive } from "@/features/boards/hooks/use-owned-boards-live";

type CreateBoardResponse = {
  board: BoardSummary;
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

const boardActionButtonStyle: CSSProperties = {
  width: 36,
  height: 36,
  border: "1px solid #d1d5db",
  borderRadius: 10,
  background: "white",
  color: "#0f172a",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  lineHeight: 0,
  cursor: "pointer"
};

function OpenBoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2.5 8.1h7.2M7.8 4.5l3.8 3.6-3.8 3.5M2.6 3.2h4.1m-4.1 9.6h4.1"
        stroke="#0f172a"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AccessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4.3 6.8V5.2a3.7 3.7 0 0 1 7.4 0v1.6M3.4 6.8h9.2v6.1H3.4zM8 9.2v2.1"
        stroke="#0f172a"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9m-7.8 0 .4 8.2a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.4-8.2m-4.9 0V3.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7v1.3"
        stroke="#7f1d1d"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function BoardsPage() {
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const {
    firebaseIsConfigured,
    user,
    idToken,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser
  } = useAuthSession();
  const { boards, boardsLoading, boardsError } = useOwnedBoardsLive(user?.uid ?? null);

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

  const handleCreateBoard = useCallback(async () => {
    if (!idToken) {
      return;
    }

    setCreatingBoard(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/boards", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });

      const payload = (await response.json()) as CreateBoardResponse | { error?: string };
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Failed to create board."));
      }

      if (!("board" in payload)) {
        throw new Error("Malformed create board response.");
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board.");
    } finally {
      setCreatingBoard(false);
    }
  }, [idToken]);

  const handleDeleteBoard = useCallback(
    async (boardId: string) => {
      if (!idToken) {
        return;
      }

      if (!window.confirm("Delete this board? This cannot be undone.")) {
        return;
      }

      setDeletingBoardId(boardId);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/boards/${boardId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${idToken}`
          }
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
    [idToken]
  );

  const combinedErrorMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }

    return boardsError;
  }, [boardsError, errorMessage]);
  const profileLabel = useMemo(
    () => user?.displayName?.trim() || user?.email?.trim() || user?.uid || "Account",
    [user]
  );
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";
  const titleText =
    user && !authLoading
      ? `My Boards (${boards.length} out of ${MAX_OWNED_BOARDS})`
      : "My Boards";

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 860, margin: "0 auto" }}>
        <h1>Boards</h1>
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
        boxSizing: "border-box",
        height: "100dvh",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: "#ffffff"
      }}
    >
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: "0.75rem",
          minHeight: 56,
          padding: "0 0.85rem",
          borderBottom: "2px solid #d1d5db",
          flexShrink: 0
        }}
      >
        <div style={{ width: 34, height: 34 }} />
        <h1
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 700,
            textAlign: "center",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
        >
          {titleText}
        </h1>
        <div style={{ display: "flex", justifyContent: "flex-end", minWidth: 34 }}>
          {user ? (
            <Link
              href="/account"
              aria-label="Open account settings"
              title="Account settings"
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                border: "1px solid #cbd5e1",
                background: "#e2e8f0",
                color: "#0f172a",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                overflow: "hidden",
                fontWeight: 600,
                textTransform: "uppercase"
              }}
            >
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt={profileLabel}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover"
                  }}
                />
              ) : (
                <span>{avatarInitial}</span>
              )}
            </Link>
          ) : null}
        </div>
      </header>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          width: "min(100%, 940px)",
          margin: "0 auto",
          padding: "1.25rem"
        }}
      >
        {authLoading ? <p>Checking authentication...</p> : null}

        {!authLoading && !user ? (
          <section>
            <p>Sign in to create and manage your boards.</p>
            <button type="button" onClick={() => void handleSignIn()}>
              Sign in with Google
            </button>
            {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
          </section>
        ) : null}

        {!authLoading && user ? (
          <section>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "1rem",
                flexWrap: "wrap"
              }}
            >
              <p style={{ margin: 0 }}>
                Signed in as <strong>{user.email ?? user.uid}</strong>
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {boards.length < MAX_OWNED_BOARDS ? (
                  <button
                    type="button"
                    disabled={creatingBoard}
                    onClick={() => void handleCreateBoard()}
                  >
                    {creatingBoard ? "Creating..." : "Create New Board"}
                  </button>
                ) : null}
                <button type="button" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </div>
            </div>

            {combinedErrorMessage ? (
              <p style={{ color: "#b91c1c" }}>{combinedErrorMessage}</p>
            ) : null}

            {boardsLoading ? <p>Loading boards...</p> : null}
            {!boardsLoading && boards.length === 0 ? (
              <p>
                No boards yet.
                {boards.length < MAX_OWNED_BOARDS ? " Create your first one." : ""}
              </p>
            ) : null}

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: "0.75rem"
              }}
            >
              {boards.map((board) => (
                <li
                  key={board.id}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 10,
                    padding: "0.9rem"
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: "0.75rem",
                      flexWrap: "wrap"
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{board.title}</p>
                      <p style={{ margin: "0.3rem 0 0", color: "#6b7280" }}>
                        {board.openEdit ? "Open edit enabled" : "Restricted edit mode"}
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: "0.4rem" }}>
                      <Link
                        href={`/boards/${board.id}`}
                        title="Open board"
                        aria-label={`Open board ${board.title}`}
                        style={boardActionButtonStyle}
                      >
                        <OpenBoardIcon />
                      </Link>
                      <Link
                        href={`/boards/${board.id}/settings`}
                        title="Control access"
                        aria-label={`Control access for ${board.title}`}
                        style={boardActionButtonStyle}
                      >
                        <AccessIcon />
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleDeleteBoard(board.id)}
                        disabled={deletingBoardId === board.id}
                        title={
                          deletingBoardId === board.id ? "Deleting board..." : "Delete board"
                        }
                        aria-label={`Delete board ${board.title}`}
                        style={{
                          ...boardActionButtonStyle,
                          borderColor: "#fecaca",
                          background: deletingBoardId === board.id ? "#fee2e2" : "#fef2f2",
                          opacity: deletingBoardId === board.id ? 0.75 : 1
                        }}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
