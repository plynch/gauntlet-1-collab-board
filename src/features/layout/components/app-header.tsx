"use client";

import Link from "next/link";
import type { User } from "firebase/auth";
import type { ReactNode } from "react";

type HeaderBackLinkProps = {
  href: string;
  label: string;
};

type AppHeaderProps = {
  user: User | null;
  leftSlot?: ReactNode;
  onSignOut?: (() => void | Promise<void>) | null;
  signOutDisabled?: boolean;
  showAccountLink?: boolean;
  title?: string;
};

export function HeaderBackLink({ href, label }: HeaderBackLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      style={{
        width: 34,
        height: 34,
        borderRadius: "50%",
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
        color: "#0f172a",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        textDecoration: "none",
        fontSize: 18
      }}
    >
      {"<"}
    </Link>
  );
}

export default function AppHeader({
  user,
  leftSlot,
  onSignOut = null,
  signOutDisabled = false,
  showAccountLink = true,
  title = "CollabBoard"
}: AppHeaderProps) {
  const profileLabel = user?.displayName?.trim() || user?.email?.trim() || user?.uid || "Account";
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";

  return (
    <header
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems: "center",
        gap: "0.75rem",
        minHeight: 56,
        padding: "0 0.85rem",
        borderBottom: "2px solid #d1d5db",
        flexShrink: 0
      }}
    >
      <div>{leftSlot ?? <div style={{ width: 34, height: 34 }} />}</div>

      <h1
        style={{
          margin: 0,
          fontSize: "1.25rem",
          fontWeight: 700,
          textAlign: "center",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {title}
      </h1>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          minWidth: 34
        }}
      >
        {user ? (
          <div
            style={{
              display: "grid",
              justifyItems: "end",
              gap: "0.2rem"
            }}
          >
            {showAccountLink ? (
              <Link
                href="/account"
                aria-label="Open account settings"
                title="Account settings"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid #cbd5e1",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textDecoration: "none",
                  overflow: "hidden",
                  fontWeight: 600,
                  textTransform: "uppercase"
                }}
              >
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
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
              </Link>
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  border: "1px solid #cbd5e1",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  fontWeight: 600,
                  textTransform: "uppercase"
                }}
              >
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.photoURL}
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
            )}

            <span
              style={{
                fontSize: 11,
                lineHeight: 1.1,
                color: "#64748b",
                maxWidth: "min(64vw, 920px)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                textAlign: "right"
              }}
              title={user.email ?? user.uid}
            >
              Signed in as {user.email ?? user.uid}
            </span>

            {onSignOut ? (
              <button
                type="button"
                onClick={() => {
                  void onSignOut();
                }}
                disabled={signOutDisabled}
                style={{
                  height: 24,
                  padding: "0 0.5rem",
                  borderRadius: 999,
                  border: "1px solid #cbd5e1",
                  background: "white",
                  color: "#0f172a",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: signOutDisabled ? "default" : "pointer",
                  opacity: signOutDisabled ? 0.6 : 1
                }}
              >
                {signOutDisabled ? "Signing out..." : "Sign out"}
              </button>
            ) : null}
          </div>
        ) : (
          <div style={{ width: 34, height: 34 }} />
        )}
      </div>
    </header>
  );
}
