"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";

import {
  getFirebaseClientAuth,
  isFirebaseClientConfigured,
} from "@/lib/firebase/client";

type AuthSessionState = {
  firebaseIsConfigured: boolean;
  user: User | null;
  idToken: string | null;
  authLoading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutCurrentUser: () => Promise<void>;
};

/**
 * Handles use auth session.
 */
export function useAuthSession(): AuthSessionState {
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const firebaseIsConfigured = isFirebaseClientConfigured();
  const auth = useMemo(
    () => (firebaseIsConfigured ? getFirebaseClientAuth() : null),
    [firebaseIsConfigured],
  );

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setIdToken(null);
      setAuthLoading(false);
      return;
    }

    let resolved = false;
    const loadingTimeout = window.setTimeout(() => {
      if (resolved) {
        return;
      }

      setUser(null);
      setIdToken(null);
      setAuthLoading(false);
    }, 4_000);

    const unsubscribe = onIdTokenChanged(
      auth,
      async (nextUser) => {
        resolved = true;
        window.clearTimeout(loadingTimeout);
        setUser(nextUser);

        if (!nextUser) {
          setIdToken(null);
          setAuthLoading(false);
          return;
        }

        try {
          const token = await nextUser.getIdToken();
          setIdToken(token);
        } catch {
          setIdToken(null);
        } finally {
          setAuthLoading(false);
        }
      },
      () => {
        resolved = true;
        window.clearTimeout(loadingTimeout);
        setUser(null);
        setAuthLoading(false);
        setIdToken(null);
      },
    );

    return () => {
      window.clearTimeout(loadingTimeout);
      unsubscribe();
    };
  }, [auth]);

  const signInWithGoogle = useCallback(async () => {
    if (!auth) {
      return;
    }

    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  }, [auth]);

  const signOutCurrentUser = useCallback(async () => {
    if (!auth) {
      return;
    }

    await signOut(auth);
  }, [auth]);

  return {
    firebaseIsConfigured,
    user,
    idToken,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser,
  };
}
