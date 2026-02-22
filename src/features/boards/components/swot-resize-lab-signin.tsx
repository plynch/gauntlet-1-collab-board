type SwotResizeLabSignInProps = {
  onSignInNewUser: () => void;
};

export function SwotResizeLabSignIn({ onSignInNewUser }: SwotResizeLabSignInProps) {
  return (
    <main style={signInMainStyle}>
      <section style={signInCardStyle}>
        <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>
          SWOT Resize E2E Lab
        </h1>
        <p style={{ margin: 0, color: "#334155" }}>
          Simulates sign-in and board interactions for deterministic end-to-end
          tests.
        </p>
        <button
          type="button"
          data-testid="sign-in-new-user"
          onClick={onSignInNewUser}
          style={signInButtonStyle}
        >
          Sign in as new user
        </button>
      </section>
    </main>
  );
}

const signInMainStyle = {
  minHeight: "100dvh",
  display: "grid",
  placeItems: "center",
  background: "#e5e7eb",
} as const;

const signInCardStyle = {
  width: 520,
  padding: 24,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  display: "grid",
  gap: 12,
} as const;

const signInButtonStyle = {
  width: 220,
  borderRadius: 8,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "white",
  padding: "10px 14px",
  fontWeight: 600,
} as const;
