"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  BoardDetail,
  BoardEditorProfile,
  BoardPermissions,
} from "@/features/boards/types";
import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useBoardLive } from "@/features/boards/hooks/use-board-live";
import AppHeader, {
  HeaderBackLink,
} from "@/features/layout/components/app-header";

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

export default function BoardSettingsWorkspace({
  boardId,
}: BoardSettingsWorkspaceProps) {
  const [savingAccess, setSavingAccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [newEditorEmail, setNewEditorEmail] = useState("");
  const [newReaderEmail, setNewReaderEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(
    null,
  );
  const [editorProfiles, setEditorProfiles] = useState<BoardEditorProfile[]>(
    [],
  );
  const [readerProfiles, setReaderProfiles] = useState<BoardEditorProfile[]>(
    [],
  );
  const [profilesLoading, setProfilesLoading] = useState(false);

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

  const editorIdsKey = useMemo(
    () => (board ? [...board.editorIds].sort().join(",") : ""),
    [board],
  );
  const readerIdsKey = useMemo(
    () => (board ? [...board.readerIds].sort().join(",") : ""),
    [board],
  );

  useEffect(() => {
    if (!permissions?.isOwner || !idToken) {
      setEditorProfiles([]);
      setReaderProfiles([]);
      setProfilesLoading(false);
      setProfileErrorMessage(null);
      return;
    }

    let isCancelled = false;

        const loadProfiles = async () => {
      setProfilesLoading(true);
      setProfileErrorMessage(null);

      try {
        const response = await fetch(`/api/boards/${boardId}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as BoardDetailsResponse;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(payload, "Failed to sync board profiles."),
          );
        }

        if (isCancelled) {
          return;
        }

        setEditorProfiles(payload.board.editors);
        setReaderProfiles(payload.board.readers);
      } catch (error) {
        if (isCancelled) {
          return;
        }

        setProfileErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to sync board profiles.",
        );
      } finally {
        if (!isCancelled) {
          setProfilesLoading(false);
        }
      }
    };

    void loadProfiles();

    return () => {
      isCancelled = true;
    };
  }, [boardId, editorIdsKey, idToken, permissions?.isOwner, readerIdsKey]);

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
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const result = (await response.json()) as BoardAccessResponse;
        if (!response.ok) {
          throw new Error(
            getErrorMessage(result, "Failed to update board access."),
          );
        }

        setEditorProfiles(result.board.editors);
        setReaderProfiles(result.board.readers);
        setProfileErrorMessage(null);
        return result.board;
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Failed to update board access.",
        );
        return null;
      } finally {
        setSavingAccess(false);
      }
    },
    [boardId, idToken],
  );

  const combinedErrorMessage = useMemo(() => {
    if (errorMessage) {
      return errorMessage;
    }

    if (boardError) {
      return boardError;
    }

    return profileErrorMessage;
  }, [boardError, errorMessage, profileErrorMessage]);
  const handleToggleOpenEdit = useCallback(
    async (nextOpenEdit: boolean) => {
      await updateAccess({
        action: "set-open-edit",
        openEdit: nextOpenEdit,
      });
    },
    [updateAccess],
  );

  const handleToggleOpenRead = useCallback(
    async (nextOpenRead: boolean) => {
      await updateAccess({
        action: "set-open-read",
        openRead: nextOpenRead,
      });
    },
    [updateAccess],
  );

  const handleAddEditor = useCallback(async () => {
    const email = newEditorEmail.trim();
    if (!email) {
      return;
    }

    const updatedBoard = await updateAccess({
      action: "add-editor",
      editorEmail: email,
    });

    if (updatedBoard) {
      setNewEditorEmail("");
    }
  }, [newEditorEmail, updateAccess]);

  const handleRemoveEditor = useCallback(
    async (editorUid: string) => {
      await updateAccess({
        action: "remove-editor",
        editorUid,
      });
    },
    [updateAccess],
  );

  const handleAddReader = useCallback(async () => {
    const email = newReaderEmail.trim();
    if (!email) {
      return;
    }

    const updatedBoard = await updateAccess({
      action: "add-reader",
      readerEmail: email,
    });

    if (updatedBoard) {
      setNewReaderEmail("");
    }
  }, [newReaderEmail, updateAccess]);

  const handleRemoveReader = useCallback(
    async (readerUid: string) => {
      await updateAccess({
        action: "remove-reader",
        readerUid,
      });
    },
    [updateAccess],
  );

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto" }}>
        <h1>Board Settings</h1>
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
        leftSlot={
          <HeaderBackLink href={`/boards/${boardId}`} label="Back to board" />
        }
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          width: "min(100%, 980px)",
          margin: "0 auto",
          padding: "1.25rem",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
          Access Settings{" "}
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            ({board?.title ?? boardId})
          </span>
        </h2>
        <p style={{ margin: "0.35rem 0 1rem" }}>
          <Link href={`/boards/${boardId}`}>Back to board</Link>
        </p>

        {authLoading ? <p>Checking authentication...</p> : null}

        {!authLoading && !user ? (
          <section>
            <p>Sign in to manage board access.</p>
            <button type="button" onClick={() => void handleSignIn()}>
              Sign in with Google
            </button>
          </section>
        ) : null}

        {combinedErrorMessage ? (
          <p style={{ color: "#b91c1c" }}>{combinedErrorMessage}</p>
        ) : null}

        {!authLoading && user ? (
          <>
            {boardLoading ? <p>Loading board settings...</p> : null}

            {!boardLoading && board && permissions && !permissions.isOwner ? (
              <section
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "1rem",
                  background: "var(--surface)",
                }}
              >
                <h2 style={{ marginTop: 0 }}>Owner-only settings</h2>
                <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
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
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "1rem",
                    background: "var(--surface)",
                  }}
                >
                  <h2 style={{ marginTop: 0 }}>Edit Access</h2>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={board.openEdit}
                      onChange={(event) =>
                        void handleToggleOpenEdit(event.target.checked)
                      }
                      disabled={savingAccess}
                    />
                    Open edit mode (any signed-in user can edit)
                  </label>

                  <p style={{ color: "var(--text-muted)" }}>
                    {board.openEdit
                      ? "Open edit is on. Editor allowlist still persists if you later turn it off."
                      : "Open edit is off. Only you and users in editor allowlist can edit."}
                  </p>

                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    <input
                      placeholder="Editor email"
                      value={newEditorEmail}
                      onChange={(event) =>
                        setNewEditorEmail(event.target.value)
                      }
                      style={{
                        minWidth: 260,
                        flex: "1 1 260px",
                        padding: "0.5rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddEditor()}
                      disabled={
                        savingAccess || newEditorEmail.trim().length === 0
                      }
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
                      gap: "0.5rem",
                    }}
                  >
                    {editorProfiles.map((editor) => (
                      <li
                        key={editor.uid}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "0.5rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          background: "var(--surface)",
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
                    {editorProfiles.length === 0 ? (
                      <li style={{ color: "var(--text-muted)" }}>
                        No editors in allowlist.
                      </li>
                    ) : null}
                  </ul>
                </section>

                <section
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "1rem",
                    background: "var(--surface)",
                  }}
                >
                  <h2 style={{ marginTop: 0 }}>Read Access</h2>
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={board.openRead}
                      onChange={(event) =>
                        void handleToggleOpenRead(event.target.checked)
                      }
                      disabled={savingAccess}
                    />
                    Open read mode (any signed-in user can view)
                  </label>

                  <p style={{ color: "var(--text-muted)" }}>
                    {board.openRead
                      ? "Open read is on. Reader allowlist still persists if you later turn it off."
                      : "Open read is off. Only you, editors, and reader allowlist users can view."}
                  </p>

                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    <input
                      placeholder="Reader email"
                      value={newReaderEmail}
                      onChange={(event) =>
                        setNewReaderEmail(event.target.value)
                      }
                      style={{
                        minWidth: 260,
                        flex: "1 1 260px",
                        padding: "0.5rem",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddReader()}
                      disabled={
                        savingAccess || newReaderEmail.trim().length === 0
                      }
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
                      gap: "0.5rem",
                    }}
                  >
                    {readerProfiles.map((reader) => (
                      <li
                        key={reader.uid}
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "0.5rem",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "0.75rem",
                          flexWrap: "wrap",
                          background: "var(--surface)",
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
                    {readerProfiles.length === 0 ? (
                      <li style={{ color: "var(--text-muted)" }}>
                        No readers in allowlist.
                      </li>
                    ) : null}
                  </ul>
                </section>
              </section>
            ) : null}

            {!boardLoading &&
            board &&
            permissions?.isOwner &&
            profilesLoading ? (
              <p style={{ color: "var(--text-muted)" }}>
                Refreshing access profiles...
              </p>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
