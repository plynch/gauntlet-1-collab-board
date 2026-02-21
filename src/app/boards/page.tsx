"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type FormEvent,
} from "react";

import { MAX_OWNED_BOARDS, type BoardSummary } from "@/features/boards/types";
import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useOwnedBoardsLive } from "@/features/boards/hooks/use-owned-boards-live";
import { copyBoardUrlToClipboard } from "@/features/boards/lib/board-share";
import AppHeader from "@/features/layout/components/app-header";

type CreateBoardResponse = {
  board: BoardSummary;
};

type UpdateBoardResponse = {
  board: BoardSummary;
};

/**
 * Gets error message.
 */
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
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "var(--surface)",
  color: "var(--text)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  lineHeight: 0,
  cursor: "pointer",
};

/**
 * Handles share board icon.
 */
function ShareBoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M9.5 3.2h3.3v3.3M8.9 7.1l3.9-3.9M7 3.2H4.6a1.8 1.8 0 0 0-1.8 1.8v6.4a1.8 1.8 0 0 0 1.8 1.8H11a1.8 1.8 0 0 0 1.8-1.8V9.8"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles access icon.
 */
function AccessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4.3 6.8V5.2a3.7 3.7 0 0 1 7.4 0v1.6M3.4 6.8h9.2v6.1H3.4zM8 9.2v2.1"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles edit icon.
 */
function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 11.8 3.6 9.3l6.8-6.8a1.2 1.2 0 0 1 1.7 0l1.4 1.4a1.2 1.2 0 0 1 0 1.7L6.7 12.4 4.2 13z"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 3.9 12.1 7.2"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Handles delete icon.
 */
function DeleteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9m-7.8 0 .4 8.2a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.4-8.2m-4.9 0V3.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7v1.3"
        stroke="currentColor"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
 * Handles boards page.
 */
export default function BoardsPage() {
  const router = useRouter();
  const [showCreateBoardForm, setShowCreateBoardForm] = useState(false);
  const [newBoardTitle, setNewBoardTitle] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null);
  const [editingBoardId, setEditingBoardId] = useState<string | null>(null);
  const [renameBoardTitle, setRenameBoardTitle] = useState("");
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [sharedBoardId, setSharedBoardId] = useState<string | null>(null);
  const shareFeedbackTimeoutRef = useRef<number | null>(null);
  const createBoardTitleInputRef = useRef<HTMLInputElement | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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
        body: JSON.stringify({
          title,
        }),
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
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to create board.",
      );
    } finally {
      setCreatingBoard(false);
    }
  }, [idToken, newBoardTitle]);

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
            Authorization: `Bearer ${idToken}`,
          },
        });

        const payload = (await response.json()) as {
          error?: string;
          ok?: boolean;
        };
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Failed to delete board."));
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to delete board.",
        );
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
    if (renamingBoardId) {
      return;
    }

    setEditingBoardId(null);
    setRenameBoardTitle("");
  }, [renamingBoardId]);

  const handleRenameBoardSubmit = useCallback(
    async (boardId: string) => {
      if (!idToken) {
        return;
      }

      const nextTitle = renameBoardTitle.trim();
      if (nextTitle.length === 0) {
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
          body: JSON.stringify({
            title: nextTitle,
          }),
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
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to rename board.",
        );
      } finally {
        setRenamingBoardId(null);
      }
    },
    [idToken, renameBoardTitle],
  );

  const handleCreateBoardSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleCreateBoard();
    },
    [handleCreateBoard],
  );

  const handleOpenCreateBoardForm = useCallback(() => {
    setErrorMessage(null);
    setShowCreateBoardForm(true);
  }, []);

  const handleCancelCreateBoardForm = useCallback(() => {
    if (creatingBoard) {
      return;
    }

    setShowCreateBoardForm(false);
    setNewBoardTitle("");
  }, [creatingBoard]);

  const handleOpenBoard = useCallback(
    (boardId: string) => {
      router.push(`/boards/${boardId}`);
    },
    [router],
  );

  const handleBoardRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, boardId: string) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleOpenBoard(boardId);
    },
    [handleOpenBoard],
  );

  const stopRowNavigation = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleShareBoard = useCallback(async (boardId: string) => {
    setErrorMessage(null);

    try {
      await copyBoardUrlToClipboard(boardId, window.location.origin);
      setSharedBoardId(boardId);
      if (shareFeedbackTimeoutRef.current !== null) {
        window.clearTimeout(shareFeedbackTimeoutRef.current);
      }
      shareFeedbackTimeoutRef.current = window.setTimeout(() => {
        setSharedBoardId((currentValue) =>
          currentValue === boardId ? null : currentValue,
        );
      }, 1_800);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to copy board link.",
      );
    }
  }, []);

  const combinedErrorMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }

    return boardsError;
  }, [boardsError, errorMessage]);

  useEffect(() => {
    if (!showCreateBoardForm || creatingBoard) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      createBoardTitleInputRef.current?.focus();
      createBoardTitleInputRef.current?.select();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [creatingBoard, showCreateBoardForm]);

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 860, margin: "0 auto" }}>
        <h1>Boards</h1>
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
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <AppHeader
        user={user}
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          width: "min(100%, 940px)",
          margin: "0 auto",
          padding: "1.25rem",
        }}
      >
        {authLoading ? <p>Checking authentication...</p> : null}

        {!authLoading && !user ? (
          <section
            style={{
              width: "min(100%, 460px)",
              margin: "4rem auto 0",
              display: "grid",
              justifyItems: "center",
              textAlign: "center",
              gap: "0.8rem",
            }}
          >
            <p style={{ margin: 0 }}>
              Sign in to create and manage your boards.
            </p>
            <button
              type="button"
              onClick={() => void handleSignIn()}
              style={{
                height: 40,
                borderRadius: 999,
                border: "1px solid #dadce0",
                background: "var(--surface)",
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
            {errorMessage ? (
              <p style={{ color: "#b91c1c" }}>{errorMessage}</p>
            ) : null}
          </section>
        ) : null}

        {!authLoading && user ? (
          <section>
            <h2
              style={{
                margin: "0 0 0.8rem",
                fontSize: "1.2rem",
              }}
            >
              My Boards ({boards.length} out of {MAX_OWNED_BOARDS})
            </h2>

            {combinedErrorMessage ? (
              <p style={{ color: "#b91c1c" }}>{combinedErrorMessage}</p>
            ) : null}

            {boardsLoading ? <p>Loading boards...</p> : null}
            {!boardsLoading && boards.length === 0 ? (
              <p>
                No boards yet.
                {boards.length < MAX_OWNED_BOARDS
                  ? " Create your first one."
                  : ""}
              </p>
            ) : null}

            <ul
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "grid",
                gap: "0.75rem",
              }}
            >
              {boards.map((board) => (
                <li
                  key={board.id}
                  role="link"
                  tabIndex={editingBoardId === board.id ? -1 : 0}
                  aria-label={`Open board ${board.title}`}
                  onClick={() => {
                    if (editingBoardId === board.id) {
                      return;
                    }
                    handleOpenBoard(board.id);
                  }}
                  onKeyDown={(event) => handleBoardRowKeyDown(event, board.id)}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "0.9rem",
                    cursor: editingBoardId === board.id ? "default" : "pointer",
                    background: "var(--surface)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div
                      style={{
                        minWidth: 0,
                        flex: "1 1 240px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.55rem",
                      }}
                    >
                      {editingBoardId === board.id ? (
                        <form
                          onSubmit={(event) => {
                            event.preventDefault();
                            void handleRenameBoardSubmit(board.id);
                          }}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                          onKeyDown={(event) => {
                            event.stopPropagation();
                          }}
                          style={{ display: "grid", gap: "0.5rem" }}
                        >
                          <input
                            value={renameBoardTitle}
                            onChange={(event) =>
                              setRenameBoardTitle(event.target.value)
                            }
                            placeholder="Board title"
                            maxLength={80}
                            disabled={renamingBoardId === board.id}
                            style={{
                              height: 34,
                              minWidth: 220,
                              maxWidth: 460,
                              padding: "0 0.6rem",
                            }}
                          />
                          <div
                            style={{
                              display: "flex",
                              gap: "0.45rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="submit"
                              disabled={renamingBoardId === board.id}
                            >
                              {renamingBoardId === board.id
                                ? "Saving..."
                                : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick={handleCancelRenameBoard}
                              disabled={renamingBoardId === board.id}
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(event) => {
                              stopRowNavigation(event);
                              handleStartRenameBoard(board);
                            }}
                            disabled={renamingBoardId === board.id}
                            className="icon-tooltip-trigger"
                            data-tooltip={
                              renamingBoardId === board.id
                                ? "Saving..."
                                : "Rename board"
                            }
                            title={
                              renamingBoardId === board.id
                                ? "Saving..."
                                : "Rename board"
                            }
                            aria-label={`Rename board ${board.title}`}
                            style={{
                              ...boardActionButtonStyle,
                              width: 34,
                              height: 34,
                              borderRadius: 9,
                              opacity: renamingBoardId === board.id ? 0.75 : 1,
                              flexShrink: 0,
                            }}
                          >
                            <EditIcon />
                          </button>
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                margin: 0,
                                fontWeight: 700,
                                fontSize: "1.45rem",
                                lineHeight: 1.1,
                              }}
                            >
                              {board.title}
                            </p>
                            <p
                              style={{
                                margin: "0.28rem 0 0",
                                color: "var(--text-muted)",
                                fontSize: "1.05rem",
                                lineHeight: 1.2,
                              }}
                            >
                              {board.openEdit
                                ? "Open edit enabled"
                                : "Restricted edit mode"}
                            </p>
                          </div>
                        </>
                      )}
                    </div>

                    <div
                      style={{ display: "flex", gap: "0.4rem" }}
                      onClick={(event) => {
                        event.stopPropagation();
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => void handleShareBoard(board.id)}
                        className="icon-tooltip-trigger"
                        data-tooltip={
                          sharedBoardId === board.id ? "Copied board URL" : "Share board"
                        }
                        title={
                          sharedBoardId === board.id ? "Copied board URL" : "Share board"
                        }
                        aria-label={`Share board ${board.title}`}
                        style={boardActionButtonStyle}
                      >
                        <ShareBoardIcon />
                      </button>
                      <Link
                        href={`/boards/${board.id}/settings`}
                        onClick={stopRowNavigation}
                        className="icon-tooltip-trigger"
                        data-tooltip="Manage access"
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
                        className="icon-tooltip-trigger"
                        data-tooltip={
                          deletingBoardId === board.id
                            ? "Deleting board..."
                            : "Delete board"
                        }
                        title={
                          deletingBoardId === board.id
                            ? "Deleting board..."
                            : "Delete board"
                        }
                        aria-label={`Delete board ${board.title}`}
                        style={{
                          ...boardActionButtonStyle,
                          borderColor: "rgba(248, 113, 113, 0.55)",
                          background:
                            deletingBoardId === board.id
                              ? "rgba(239, 68, 68, 0.24)"
                              : "rgba(239, 68, 68, 0.14)",
                          color: "rgb(153, 27, 27)",
                          opacity: deletingBoardId === board.id ? 0.75 : 1,
                        }}
                      >
                        <DeleteIcon />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {boards.length < MAX_OWNED_BOARDS ? (
              <div
                style={{
                  marginTop: "1rem",
                  display: "grid",
                  justifyItems: "center",
                  gap: "0.55rem",
                }}
              >
                {showCreateBoardForm ? (
                  <form
                    onSubmit={handleCreateBoardSubmit}
                    style={{
                      display: "grid",
                      justifyItems: "center",
                      gap: "0.5rem",
                      width: "min(100%, 420px)",
                    }}
                  >
                    <input
                      ref={createBoardTitleInputRef}
                      value={newBoardTitle}
                      onChange={(event) => setNewBoardTitle(event.target.value)}
                      placeholder="Board title"
                      maxLength={80}
                      disabled={creatingBoard}
                      autoFocus
                      style={{
                        width: "100%",
                        height: 40,
                        padding: "0 0.7rem",
                      }}
                    />
                    <div
                      style={{
                        display: "flex",
                        gap: "0.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <button type="submit" disabled={creatingBoard}>
                        {creatingBoard ? "Creating..." : "Create board"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelCreateBoardForm}
                        disabled={creatingBoard}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenCreateBoardForm}
                    style={{
                      minWidth: 240,
                      height: 46,
                      padding: "0 1.1rem",
                      borderRadius: 10,
                      border: "1px solid #15803d",
                      background: "#16a34a",
                      color: "white",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 6px 16px rgba(22, 163, 74, 0.22)",
                    }}
                  >
                    Create New Board
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
