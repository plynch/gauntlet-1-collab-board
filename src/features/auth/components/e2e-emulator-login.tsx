"use client";

import { useState } from "react";
import { signInWithCustomToken } from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";

import { getFirebaseClientAuth } from "@/lib/firebase/client";

type CustomTokenResponse = {
  token: string;
  uid: string;
  email: string;
};

/**
 * Gets error message.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Failed to sign in with emulator user.";
}

/**
 * Handles e2e emulator login.
 */
export default function E2eEmulatorLogin() {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedUid = searchParams.get("uid");
  const requestedEmail = searchParams.get("email");

  /**
   * Handles handle sign in.
   */
  const handleSignIn = async () => {
    setPending(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams();
      if (requestedUid && requestedUid.trim().length > 0) {
        params.set("uid", requestedUid.trim());
      }
      if (requestedEmail && requestedEmail.trim().length > 0) {
        params.set("email", requestedEmail.trim());
      }

      const requestUrl =
        params.toString().length > 0
          ? `/api/e2e/custom-token?${params.toString()}`
          : "/api/e2e/custom-token";
      const response = await fetch(
        requestUrl,
      );
      const payload = (await response.json()) as
        | CustomTokenResponse
        | { error?: string };

      if (!response.ok || !("token" in payload)) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            payload.error
            ? payload.error
            : "Failed to get emulator token.",
        );
      }

      await signInWithCustomToken(getFirebaseClientAuth(), payload.token);
      setSignedInEmail(payload.email);
      router.push("/");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#e5e7eb",
        padding: 24,
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          padding: 24,
          borderRadius: 12,
          border: "1px solid #cbd5e1",
          background: "#f8fafc",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ margin: 0, color: "#0f172a", fontSize: 24 }}>
          Firebase Emulator Login
        </h1>
        <p style={{ margin: 0, color: "#334155", fontSize: 14 }}>
          Signs in with Firebase Auth emulator custom token, then redirects to
          the app root.
        </p>
        <button
          type="button"
          data-testid="emulator-login-button"
          onClick={() => void handleSignIn()}
          disabled={pending}
          style={{
            width: 260,
            height: 40,
            borderRadius: 8,
            border: "1px solid #2563eb",
            background: pending ? "#93c5fd" : "#2563eb",
            color: "white",
            fontWeight: 700,
            cursor: pending ? "default" : "pointer",
          }}
        >
          {pending ? "Signing in..." : "Sign in emulator user"}
        </button>
        {signedInEmail ? (
          <p
            data-testid="emulator-login-email"
            style={{ margin: 0, color: "#0f766e", fontSize: 13 }}
          >
            Signed in: {signedInEmail}
          </p>
        ) : null}
        {errorMessage ? (
          <p
            data-testid="emulator-login-error"
            style={{ margin: 0, color: "#b91c1c", fontSize: 13 }}
          >
            {errorMessage}
          </p>
        ) : null}
      </section>
    </main>
  );
}
