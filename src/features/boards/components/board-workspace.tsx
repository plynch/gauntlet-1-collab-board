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

import type { BoardDetail, BoardPermissions } from "@/features/boards/types";
import {
  getFirebaseClientAuth,
  isFirebaseClientConfigured
} from "@/lib/firebase/client";
import RealtimeBoardCanvas from "@/features/boards/components/realtime-board-canvas";

type BoardDetailsResponse = {
  board: BoardDetail;
  permissions: BoardPermissions;
  error?: string;
  debug?: string;
};

type BoardWorkspaceProps = {
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

export default function BoardWorkspace({ boardId }: BoardWorkspaceProps) {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [boardLoading, setBoardLoading] = useState(false);
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [permissions, setPermissions] = useState<BoardPermissions | null>(null);
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
        throw new Error(getErrorMessage(payload, "Failed to load board."));
      }

      setBoard(payload.board);
      setPermissions(payload.permissions);
    } catch (error) {
      setBoard(null);
      setPermissions(null);
      setErrorMessage(error instanceof Error ? error.message : "Failed to load board.");
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

        {errorMessage ? (
          <p style={{ color: "#b91c1c", marginTop: "1rem" }}>{errorMessage}</p>
        ) : null}

        {!authLoading && user ? (
          <>
            {boardLoading ? <p>Loading board...</p> : null}

            {!boardLoading && board && permissions ? (
              <div style={{ height: "100%", minHeight: 0 }}>
                <RealtimeBoardCanvas
                  boardId={boardId}
                  user={user}
                  permissions={permissions}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
