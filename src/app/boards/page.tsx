"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User
} from "firebase/auth";

import { MAX_OWNED_BOARDS, type BoardSummary } from "@/features/boards/types";
import {
  getFirebaseClientAuth,
  isFirebaseClientConfigured
} from "@/lib/firebase/client";

type ListBoardsResponse = {
  boards: BoardSummary[];
  maxOwnedBoards: number;
};

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

export default function BoardsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [boards, setBoards] = useState<BoardSummary[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [maxOwnedBoards, setMaxOwnedBoards] = useState(MAX_OWNED_BOARDS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firebaseIsConfigured = isFirebaseClientConfigured();
  const auth = useMemo(
    () => (firebaseIsConfigured ? getFirebaseClientAuth() : null),
    [firebaseIsConfigured]
  );

  const fetchBoards = useCallback(
    async (token: string) => {
      setBoardsLoading(true);
      setErrorMessage(null);

      try {
        const response = await fetch("/api/boards", {
          headers: {
            Authorization: `Bearer ${token}`
          },
          cache: "no-store"
        });

        const payload = (await response.json()) as ListBoardsResponse | { error?: string };
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Failed to load boards."));
        }

        setBoards((payload as ListBoardsResponse).boards);
        setMaxOwnedBoards((payload as ListBoardsResponse).maxOwnedBoards);
      } catch (error) {
        setBoards([]);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load boards.");
      } finally {
        setBoardsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIdToken(null);
        setBoards([]);
        setErrorMessage(null);
        setAuthLoading(false);
        return;
      }

      const token = await nextUser.getIdToken();
      setIdToken(token);
      setAuthLoading(false);
    });

    return unsubscribe;
  }, [auth]);

  useEffect(() => {
    if (!idToken) {
      return;
    }

    void fetchBoards(idToken);
  }, [fetchBoards, idToken]);

  const handleSignIn = useCallback(async () => {
    if (!auth) {
      return;
    }

    const provider = new GoogleAuthProvider();
    setErrorMessage(null);

    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    }
  }, [auth]);

  const handleSignOut = useCallback(async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
  }, [auth]);

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
        body: JSON.stringify({ title: titleInput })
      });

      const payload = (await response.json()) as CreateBoardResponse | { error?: string };
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Failed to create board."));
      }

      if (!("board" in payload)) {
        throw new Error("Malformed create board response.");
      }

      setTitleInput("");
      setBoards((previous) => [payload.board, ...previous]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to create board.");
    } finally {
      setCreatingBoard(false);
    }
  }, [idToken, titleInput]);

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

        setBoards((previous) => previous.filter((board) => board.id !== boardId));
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to delete board.");
      } finally {
        setDeletingBoardId(null);
      }
    },
    [idToken]
  );

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
    <main style={{ padding: "2rem", maxWidth: 860, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1rem"
        }}
      >
        <h1 style={{ margin: 0 }}>My Boards</h1>
      </header>

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
              marginBottom: "1rem"
            }}
          >
            <p style={{ margin: 0 }}>
              Signed in as <strong>{user.email ?? user.uid}</strong>
            </p>
            <button type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>

          <div
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 10,
              padding: "1rem",
              marginBottom: "1rem"
            }}
          >
            <h2 style={{ marginTop: 0 }}>Create board</h2>
            <p style={{ marginTop: 0 }}>
              You own {boards.length} / {maxOwnedBoards} boards.
            </p>

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap"
              }}
            >
              <input
                placeholder="Board title (optional)"
                value={titleInput}
                onChange={(event) => setTitleInput(event.target.value)}
                style={{ minWidth: 260, flex: "1 1 260px", padding: "0.5rem" }}
              />
              <button
                type="button"
                disabled={creatingBoard || boards.length >= maxOwnedBoards}
                onClick={() => void handleCreateBoard()}
              >
                {creatingBoard ? "Creating..." : "Create board"}
              </button>
            </div>
          </div>

          {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}

          <h2>Owned boards</h2>
          {boardsLoading ? <p>Loading boards...</p> : null}
          {!boardsLoading && boards.length === 0 ? (
            <p>No boards yet. Create your first board above.</p>
          ) : null}

          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" }}>
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
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Link href={`/boards/${board.id}`}>Open</Link>
                    <button
                      type="button"
                      onClick={() => void handleDeleteBoard(board.id)}
                      disabled={deletingBoardId === board.id}
                    >
                      {deletingBoardId === board.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
