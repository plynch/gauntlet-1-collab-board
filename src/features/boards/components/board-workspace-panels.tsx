import type { CSSProperties } from "react";

import { GoogleBrandIcon } from "@/features/boards/components/board-workspace-icons";

export function FirebaseConfigMissingPanel() {
  return (
    <main
      style={{
        width: "100%",
        maxWidth: "none",
        margin: 0,
        padding: "1.25rem",
        height: "100dvh",
        overflow: "hidden",
        boxSizing: "border-box",
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

export function StatusLabel({ text }: { text: string }) {
  return <div style={{ margin: "auto", color: "var(--text-muted)" }}>{text}</div>;
}

export function SignInPrompt({ onSignIn }: { onSignIn: () => void }) {
  return (
    <section
      style={{
        width: "min(100%, 460px)",
        margin: "auto",
        display: "grid",
        justifyItems: "center",
        textAlign: "center",
        gap: "0.8rem",
      }}
    >
      <p style={{ margin: 0 }}>Sign in to access this board.</p>
      <button
        type="button"
        onClick={onSignIn}
        style={{
          height: 40,
          borderRadius: 999,
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: "var(--text)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.6rem",
          padding: "0 0.95rem",
          fontWeight: 500,
          fontSize: 14,
          cursor: "pointer",
          boxShadow: "0 1px 2px rgba(15,23,42,0.18)",
        }}
      >
        <GoogleBrandIcon />
        <span>Sign in with Google</span>
      </button>
    </section>
  );
}

export function BoardErrorAlert({
  message,
  accessDenied,
  onGoToBoards,
  onRetry,
}: {
  message: string;
  accessDenied: boolean;
  onGoToBoards: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        margin: 0,
        position: "absolute",
        left: 12,
        top: 68,
        zIndex: 10,
        maxWidth: "min(92vw, 560px)",
        border: "1px solid rgba(239, 68, 68, 0.45)",
        borderRadius: 10,
        background: "color-mix(in oklab, var(--surface) 88%, transparent)",
        color: "var(--text)",
        padding: "0.7rem 0.8rem",
        display: "grid",
        gap: "0.4rem",
      }}
    >
      <strong style={{ fontSize: 13, color: "var(--danger-text)" }}>
        {accessDenied ? "Board access changed" : "Board sync issue"}
      </strong>
      <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{message}</span>
      {accessDenied ? (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onGoToBoards}
            style={actionButtonStyle}
          >
            Go to My Boards
          </button>
          <button type="button" onClick={onRetry} style={actionButtonStyle}>
            Retry
          </button>
        </div>
      ) : null}
    </div>
  );
}

const actionButtonStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--surface)",
  color: "var(--text)",
  height: 30,
  padding: "0 0.65rem",
  fontSize: 12,
  fontWeight: 600,
};
