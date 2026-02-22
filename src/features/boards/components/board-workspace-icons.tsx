import type { CSSProperties } from "react";

export const titleActionButtonStyle: CSSProperties = {
  width: 34,
  height: 34,
  border: "1px solid var(--border)",
  borderRadius: 9,
  background: "var(--surface)",
  color: "var(--text)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  lineHeight: 0,
  cursor: "pointer",
  flexShrink: 0,
};

export function GoogleBrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.89 2.69-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.8.54-1.84.86-3.05.86-2.34 0-4.31-1.58-5.02-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.02-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.43 1.34l2.57-2.57C13.47.94 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.02 2.33c.71-2.12 2.68-3.7 5.02-3.7z"
      />
    </svg>
  );
}

export function ShareBoardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M9.5 3.2h3.3v3.3M8.9 7.1l3.9-3.9M7 3.2H4.6a1.8 1.8 0 0 0-1.8 1.8v6.4a1.8 1.8 0 0 0 1.8 1.8H11a1.8 1.8 0 0 0 1.8-1.8V9.8"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function EditIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 11.8 3.6 9.3l6.8-6.8a1.2 1.2 0 0 1 1.7 0l1.4 1.4a1.2 1.2 0 0 1 0 1.7L6.7 12.4 4.2 13z"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 3.9 12.1 7.2"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}
