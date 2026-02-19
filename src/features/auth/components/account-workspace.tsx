"use client";

import { useRouter } from "next/navigation";
import { updateProfile } from "firebase/auth";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuthSession } from "@/features/auth/hooks/use-auth-session";
import AppHeader, {
  HeaderBackLink,
} from "@/features/layout/components/app-header";

/**
 * Handles account workspace.
 */
export default function AccountWorkspace() {
  const router = useRouter();
  const [displayNameInput, setDisplayNameInput] = useState("");
  const [photoUrlInput, setPhotoUrlInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const { firebaseIsConfigured, user, authLoading, signOutCurrentUser } =
    useAuthSession();

  useEffect(() => {
    setDisplayNameInput(user?.displayName ?? "");
    setPhotoUrlInput(user?.photoURL ?? "");
  }, [user?.displayName, user?.photoURL, user?.uid]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/");
    }
  }, [authLoading, router, user]);

  const profileLabel = useMemo(
    () =>
      user?.displayName?.trim() ||
      user?.email?.trim() ||
      user?.uid ||
      "Account",
    [user],
  );
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";
  const avatarPreviewUrl =
    photoUrlInput.trim().length > 0 ? photoUrlInput.trim() : null;

  const handleSignOut = useCallback(async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
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
        photoURL: nextPhotoUrl.length > 0 ? nextPhotoUrl : null,
      });
      setSuccessMessage("Profile updated.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to update profile.",
      );
    } finally {
      setIsSaving(false);
    }
  }, [displayNameInput, photoUrlInput, user]);

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 760, margin: "0 auto" }}>
        <h1>Account</h1>
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
        background: "#ffffff",
      }}
    >
      <AppHeader
        user={user}
        leftSlot={<HeaderBackLink href="/" label="Back to My Boards" />}
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
        showAccountLink={false}
      />

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          width: "min(100%, 760px)",
          margin: "0 auto",
          padding: "1.25rem",
        }}
      >
        {authLoading || !user ? <p>Redirecting to My Boards...</p> : null}

        {!authLoading && user ? (
          <section
            style={{
              border: "1px solid #d1d5db",
              borderRadius: 12,
              background: "white",
              padding: "1.25rem",
              display: "grid",
              gap: "1rem",
            }}
          >
            <h2 style={{ margin: 0 }}>Account Settings</h2>
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
                  overflow: "hidden",
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
                      objectFit: "cover",
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
            </div>

            {errorMessage ? (
              <p style={{ color: "#b91c1c", margin: 0 }}>{errorMessage}</p>
            ) : null}
            {successMessage ? (
              <p style={{ color: "#166534", margin: 0 }}>{successMessage}</p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
