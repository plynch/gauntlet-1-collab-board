"use client";

import Link from "next/link";
import { updateProfile } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";

export default function AccountWorkspace() {
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const {
    firebaseIsConfigured,
    user,
    authLoading,
    signInWithGoogle,
    signOutCurrentUser
  } = useAuthSession();

  useEffect(() => {
    setDisplayNameInput(user?.displayName ?? "");
    setPhotoUrlInput(user?.photoURL ?? "");
  }, [user?.displayName, user?.photoURL, user?.uid]);

  const profileLabel = useMemo(
    () => user?.displayName?.trim() || user?.email?.trim() || user?.uid || "Account",
    [user]
  );
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";
  const avatarPreviewUrl = photoUrlInput.trim().length > 0 ? photoUrlInput.trim() : null;

  const handleSignIn = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signInWithGoogle();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign in failed.");
    }
  }, [signInWithGoogle]);

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await signOutCurrentUser();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Sign out failed.");
    }
  }, [signOutCurrentUser]);

  const handleSave = useCallback(async () => {
    if (!user) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSaving(true);

    const nextDisplayName = displayNameInput.trim();
    const nextPhotoUrl = photoUrlInput.trim();

    try {
      await updateProfile(user, {
        displayName: nextDisplayName.length > 0 ? nextDisplayName : null,
        photoURL: nextPhotoUrl.length > 0 ? nextPhotoUrl : null
      });
      setSuccessMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to update profile.");
    } finally {
      setIsSaving(false);
    }
  }, [displayNameInput, photoUrlInput, user]);

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
        <h1>Account</h1>
        <p>
          Firebase is not configured yet. Add your values to <code>.env.local</code>{" "}
          using <code>.env.example</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
          marginBottom: "1.25rem"
        }}
      >
        <h1 style={{ margin: 0 }}>Account Settings</h1>
        <Link href="/">Back to My Boards</Link>
      </header>

      {authLoading ? <p>Checking authentication...</p> : null}

      {!authLoading && !user ? (
        <section>
          <p>Sign in to view and update your account.</p>
          <button type="button" onClick={() => void handleSignIn()}>
            Sign in with Google
          </button>
        </section>
      ) : null}

      {!authLoading && user ? (
        <section
          style={{
            border: "1px solid #d1d5db",
            borderRadius: 12,
            background: "white",
            padding: "1.25rem",
            display: "grid",
            gap: "1rem"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div
              style={{
                width: 62,
                height: 62,
                borderRadius: "50%",
                border: "1px solid #cbd5e1",
                background: "#e2e8f0",
                color: "#0f172a",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textTransform: "uppercase",
                fontWeight: 700,
                overflow: "hidden"
              }}
            >
              {avatarPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreviewUrl}
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
            </div>
            <div>
              <p style={{ margin: 0, color: "#475569" }}>Email</p>
              <p style={{ margin: "0.2rem 0 0", fontWeight: 600 }}>
                {user.email ?? "No email available"}
              </p>
            </div>
          </div>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span>Display name</span>
            <input
              value={displayNameInput}
              onChange={(event) => setDisplayNameInput(event.target.value)}
              placeholder="Display name"
              style={{ padding: "0.55rem 0.65rem" }}
            />
          </label>

          <label style={{ display: "grid", gap: "0.4rem" }}>
            <span>Profile image URL</span>
            <input
              value={photoUrlInput}
              onChange={(event) => setPhotoUrlInput(event.target.value)}
              placeholder="https://..."
              style={{ padding: "0.55rem 0.65rem" }}
            />
          </label>

          <div style={{ display: "flex", gap: "0.65rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save profile"}
            </button>
            <button type="button" onClick={() => void handleSignOut()}>
              Sign out
            </button>
          </div>
        </section>
      ) : null}

      {errorMessage ? <p style={{ color: "#b91c1c" }}>{errorMessage}</p> : null}
      {successMessage ? <p style={{ color: "#166534" }}>{successMessage}</p> : null}
    </main>
  );
}
