import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import { useBoardLive } from "@/features/boards/hooks/use-board-live";
import type {
  BoardDetail,
  BoardEditorProfile,
  BoardPermissions,
} from "@/features/boards/types";

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

export function useBoardSettingsState(boardId: string) {
  const [savingAccess, setSavingAccess] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [newEditorEmail, setNewEditorEmail] = useState("");
  const [newReaderEmail, setNewReaderEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null);
  const [editorProfiles, setEditorProfiles] = useState<BoardEditorProfile[]>([]);
  const [readerProfiles, setReaderProfiles] = useState<BoardEditorProfile[]>([]);
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
          headers: { Authorization: `Bearer ${idToken}` },
          cache: "no-store",
        });
        const payload = (await response.json()) as BoardDetailsResponse;
        if (!response.ok) {
          throw new Error(getErrorMessage(payload, "Failed to sync board profiles."));
        }
        if (!isCancelled) {
          setEditorProfiles(payload.board.editors);
          setReaderProfiles(payload.board.readers);
        }
      } catch (error) {
        if (!isCancelled) {
          setProfileErrorMessage(
            error instanceof Error ? error.message : "Failed to sync board profiles.",
          );
        }
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
          throw new Error(getErrorMessage(result, "Failed to update board access."));
        }

        setEditorProfiles(result.board.editors);
        setReaderProfiles(result.board.readers);
        setProfileErrorMessage(null);
        return result.board;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Failed to update board access.");
        return null;
      } finally {
        setSavingAccess(false);
      }
    },
    [boardId, idToken],
  );

  const combinedErrorMessage = useMemo(
    () => errorMessage ?? boardError ?? profileErrorMessage ?? null,
    [boardError, errorMessage, profileErrorMessage],
  );

  return {
    authLoading,
    board,
    boardId,
    boardLoading,
    combinedErrorMessage,
    editorProfiles,
    firebaseIsConfigured,
    handleSignIn,
    handleSignOut,
    newEditorEmail,
    newReaderEmail,
    permissions,
    profilesLoading,
    readerProfiles,
    savingAccess,
    setNewEditorEmail,
    setNewReaderEmail,
    signingOut,
    updateAccess,
    user,
  };
}
