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

    const unsubscribe = onIdTokenChanged(auth, async (nextUser) => {
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
    });

    return unsubscribe;
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
