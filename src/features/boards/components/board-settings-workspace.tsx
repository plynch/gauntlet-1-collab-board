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

import type { BoardDetail, BoardEditorProfile, BoardPermissions } from "@/features/boards/types";
import {
  getFirebaseClientAuth,
  isFirebaseClientConfigured
} from "@/lib/firebase/client";

type BoardDetailsResponse = {
  board: BoardDetail;
  permissions: BoardPermissions;
  error?: string;
  debug?: string;
};

type BoardAccessResponse = {
  board: BoardDetail;
  error?: string;
  debug?: string;
};

type BoardSettingsWorkspaceProps = {
  boardId: string;
};

function getErrorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "object" && payload !== null) {
    const candidate = payload as { error?: unknown; debug?: unknown };

    if (typeof candidate.error === "string" && candidate.error.length > 0) {
      if (typeof candidate.debug === "string" && candidate.debug.length > 0) {
        return `${candidate.error} (${candidate.debug})`;
      }

      return candidate.error;
    }
  }

  return fallback;
}

function getProfileLabel(profile: BoardEditorProfile): string {
  return profile.email ?? profile.displayName ?? profile.uid;
}

export default function BoardSettingsWorkspace({ boardId }: BoardSettingsWorkspaceProps) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [permissions, setPermissions] = useState<BoardPermissions | null>(null);
  const [newEditorEmail, setNewEditorEmail] = useState("");
  const [newReaderEmail, setNewReaderEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const firebaseIsConfigured = isFirebaseClientConfigured();
  const auth = useMemo(
    () => (firebaseIsConfigured ? getFirebaseClientAuth() : null),
    [firebaseIsConfigured]
  );

  const loadBoard = useCallback(async (token: string) => {
    setBoardLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/boards/${boardId}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      const payload = (await response.json()) as BoardDetailsResponse;
      if (!response.ok) {
        throw new Error(getErrorMessage(payload, "Failed to load board settings."));
      }

      setBoard(payload.board);
      setPermissions(payload.permissions);
    } catch (error) {
      setBoard(null);
      setPermissions(null);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load board settings."
      );
    } finally {
      setBoardLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    if (!auth) {
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
      setUser(nextUser);

      if (!nextUser) {
        setIdToken(null);
        setBoard(null);
        setPermissions(null);
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

    void loadBoard(idToken);
  }, [idToken, loadBoard]);

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

  const updateAccess = useCallback(
    async (payload: object): Promise<BoardDetail | null> => {
      if (!idToken) {
        return null;
      }

      setSavingAccess(true);
      setErrorMessage(null);

      try {
        const response = await fetch(`/api/boards/${boardId}/access`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(payload)
        });

        const result = (await response.json()) as BoardAccessResponse;
        if (!response.ok) {
          throw new Error(getErrorMessage(result, "Failed to update board access."));
        }

        setBoard(result.board);
        return result.board;
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to update board access."
        );
        return null;
      } finally {
        setSavingAccess(false);
      }
    },
    [boardId, idToken]
  );

  const handleToggleOpenEdit = useCallback(
    async (nextOpenEdit: boolean) => {
      await updateAccess({
        action: "set-open-edit",
        openEdit: nextOpenEdit
      });
    },
    [updateAccess]
  );

  const handleToggleOpenRead = useCallback(
    async (nextOpenRead: boolean) => {
      await updateAccess({
        action: "set-open-read",
        openRead: nextOpenRead
      });
    },
    [updateAccess]
  );

  const handleAddEditor = useCallback(async () => {
    const email = newEditorEmail.trim();
    if (!email) {
      return;
    }

    const updatedBoard = await updateAccess({
      action: "add-editor",
      editorEmail: email
    });

    if (updatedBoard) {
      setNewEditorEmail("");
    }
  }, [newEditorEmail, updateAccess]);

  const handleRemoveEditor = useCallback(
    async (editorUid: string) => {
      await updateAccess({
        action: "remove-editor",
        editorUid
      });
    },
    [updateAccess]
  );

  const handleAddReader = useCallback(async () => {
    const email = newReaderEmail.trim();
    if (!email) {
      return;
    }

    const updatedBoard = await updateAccess({
      action: "add-reader",
      readerEmail: email
    });

    if (updatedBoard) {
      setNewReaderEmail("");
    }
  }, [newReaderEmail, updateAccess]);

  const handleRemoveReader = useCallback(
    async (readerUid: string) => {
      await updateAccess({
        action: "remove-reader",
        readerUid
      });
    },
    [updateAccess]
  );

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto" }}>
        <h1>Board Settings</h1>
        <p>
          Firebase is not configured yet. Add your values to <code>.env.local</code> using{" "}
          <code>.env.example</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto" }}>
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
            <Link href={`/boards/${boardId}`}>Back to board</Link>
          </p>
          <h1 style={{ margin: "0.3rem 0 0" }}>
            Access Settings{" "}
            <span style={{ color: "#6b7280", fontWeight: 400 }}>
              ({board?.title ?? boardId})
            </span>
          </h1>
        </div>
        {user ? (
          <button type="button" onClick={() => void handleSignOut()}>
            Sign out
          </button>
        ) : null}
      </header>

      {authLoading ? <p>Checking authentication...</p> : null}

      {!authLoading && !user ? (
        <section>
          <p>Sign in to manage board access.</p>
          <button type="button" onClick={() => void handleSignIn()}>
            Sign in with Google
          </button>
        </section>
      ) : null}

      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}

      {!authLoading && user ? (
        <>
          {boardLoading ? <p>Loading board settings...</p> : null}

          {!boardLoading && board && permissions && !permissions.isOwner ? (
            <section
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                padding: "1rem"
              }}
            >
              <h2 style={{ marginTop: 0 }}>Owner-only settings</h2>
              <p style={{ marginTop: 0, color: "#4b5563" }}>
                Only the board owner can manage access for this board.
              </p>
              <p style={{ marginBottom: 0 }}>
                <Link href={`/boards/${boardId}`}>Return to board</Link>
              </p>
            </section>
          ) : null}

          {!boardLoading && board && permissions && permissions.isOwner ? (
            <section style={{ display: "grid", gap: "1rem" }}>
              <section
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "1rem"
                }}
              >
                <h2 style={{ marginTop: 0 }}>Edit Access</h2>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={board.openEdit}
                    onChange={(event) => void handleToggleOpenEdit(event.target.checked)}
                    disabled={savingAccess}
                  />
                  Open edit mode (any signed-in user can edit)
                </label>

                <p style={{ color: "#6b7280" }}>
                  {board.openEdit
                    ? "Open edit is on. Editor allowlist still persists if you later turn it off."
                    : "Open edit is off. Only you and users in editor allowlist can edit."}
                </p>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    placeholder="Editor email"
                    value={newEditorEmail}
                    onChange={(event) => setNewEditorEmail(event.target.value)}
                    style={{ minWidth: 260, flex: "1 1 260px", padding: "0.5rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddEditor()}
                    disabled={savingAccess || newEditorEmail.trim().length === 0}
                  >
                    Add editor
                  </button>
                </div>

                <ul
                  style={{
                    listStyle: "none",
                    margin: "0.75rem 0 0",
                    padding: 0,
                    display: "grid",
                    gap: "0.5rem"
                  }}
                >
                  {board.editors.map((editor) => (
                    <li
                      key={editor.uid}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "0.5rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap"
                      }}
                    >
                      <span>{getProfileLabel(editor)}</span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveEditor(editor.uid)}
                        disabled={savingAccess}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {board.editors.length === 0 ? (
                    <li style={{ color: "#6b7280" }}>No editors in allowlist.</li>
                  ) : null}
                </ul>
              </section>

              <section
                style={{
                  border: "1px solid #d1d5db",
                  borderRadius: 10,
                  padding: "1rem"
                }}
              >
                <h2 style={{ marginTop: 0 }}>Read Access</h2>
                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem"
                  }}
                >
                  <input
                    type="checkbox"
                    checked={board.openRead}
                    onChange={(event) => void handleToggleOpenRead(event.target.checked)}
                    disabled={savingAccess}
                  />
                  Open read mode (any signed-in user can view)
                </label>

                <p style={{ color: "#6b7280" }}>
                  {board.openRead
                    ? "Open read is on. Reader allowlist still persists if you later turn it off."
                    : "Open read is off. Only you, editors, and reader allowlist users can view."}
                </p>

                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <input
                    placeholder="Reader email"
                    value={newReaderEmail}
                    onChange={(event) => setNewReaderEmail(event.target.value)}
                    style={{ minWidth: 260, flex: "1 1 260px", padding: "0.5rem" }}
                  />
                  <button
                    type="button"
                    onClick={() => void handleAddReader()}
                    disabled={savingAccess || newReaderEmail.trim().length === 0}
                  >
                    Add reader
                  </button>
                </div>

                <ul
                  style={{
                    listStyle: "none",
                    margin: "0.75rem 0 0",
                    padding: 0,
                    display: "grid",
                    gap: "0.5rem"
                  }}
                >
                  {board.readers.map((reader) => (
                    <li
                      key={reader.uid}
                      style={{
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        padding: "0.5rem",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "0.75rem",
                        flexWrap: "wrap"
                      }}
                    >
                      <span>{getProfileLabel(reader)}</span>
                      <button
                        type="button"
                        onClick={() => void handleRemoveReader(reader.uid)}
                        disabled={savingAccess}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  {board.readers.length === 0 ? (
                    <li style={{ color: "#6b7280" }}>No readers in allowlist.</li>
                  ) : null}
                </ul>
              </section>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
