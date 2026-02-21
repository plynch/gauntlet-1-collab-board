"use client";

import Link from "next/link";
import type { User } from "firebase/auth";
import type { ReactNode } from "react";
import { useTheme } from "@/features/theme/use-theme";

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
  titleAction?: ReactNode;
};

/**
 * Handles moon icon.
 */
function MoonIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
      <path
        d="M12.6 2.6a7.5 7.5 0 1 0 4.8 13.2A7 7 0 0 1 12.6 2.6z"
        stroke="currentColor"
        strokeWidth="1.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles sun icon.
 */
function SunIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="3.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
      <path
        d="M10 1.9v2.2M10 15.9v2.2M1.9 10h2.2M15.9 10h2.2M4.1 4.1l1.6 1.6M14.3 14.3l1.6 1.6M15.9 4.1l-1.6 1.6M5.7 14.3l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Handles header back link.
 */
export function HeaderBackLink({ href, label }: HeaderBackLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-lg no-underline"
      style={{
        border: "1px solid var(--border)",
        background: "var(--surface-subtle)",
        color: "var(--text)",
      }}
    >
      {"<"}
    </Link>
  );
}

/**
 * Handles app header.
 */
export default function AppHeader({
  user,
  leftSlot,
  onSignOut = null,
  signOutDisabled = false,
  showAccountLink = true,
  title = "CollabBoard",
  titleAction,
}: AppHeaderProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const profileLabel =
    user?.displayName?.trim() || user?.email?.trim() || user?.uid || "Account";
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";

  return (
    <header
      className="grid min-h-14 shrink-0 grid-cols-[minmax(132px,1fr)_auto_minmax(300px,1fr)] items-center gap-3 px-3.5"
      style={{
        background: "var(--surface)",
        borderBottom: "2px solid var(--border)",
        color: "var(--text)",
      }}
    >
      <div className="flex min-h-[42px] items-center">
        {leftSlot ?? <div className="h-[34px] w-[34px]" />}
      </div>

      <h1 className="m-0 text-center text-xl font-bold">
        <span className="inline-flex max-w-full items-center gap-2">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {title}
          </span>
          {titleAction ? <span className="shrink-0">{titleAction}</span> : null}
        </span>
      </h1>

      <div className="flex min-h-[42px] min-w-[34px] justify-end">
        <div className="flex items-center gap-2">
          {user ? (
            <span
              className="hidden max-w-[min(26vw,360px)] overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11px] leading-[1.1] md:inline"
              title={user.email ?? user.uid}
              style={{ color: "var(--text-muted)" }}
            >
              Signed in as {user.email ?? user.uid}
            </span>
          ) : null}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={
              resolvedTheme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            title={
              resolvedTheme === "dark"
                ? "Switch to light mode"
                : "Switch to dark mode"
            }
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full transition-all duration-200"
            style={{
              border: "1px solid var(--border)",
              background: "var(--surface-subtle)",
              color: resolvedTheme === "dark" ? "#facc15" : "#0f766e",
              transform: "translateZ(0)",
            }}
          >
            {resolvedTheme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>

          {user ? (
            <div className="flex items-center gap-2">
              {showAccountLink ? (
                <Link
                  href="/account"
                  aria-label="Open account settings"
                  title="Account settings"
                  className="inline-flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full no-underline"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                >
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoURL}
                      alt={profileLabel}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold uppercase">
                      {avatarInitial}
                    </span>
                  )}
                </Link>
              ) : (
                <div
                  aria-hidden="true"
                  className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                >
                  {user.photoURL ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={user.photoURL}
                      alt={profileLabel}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold uppercase">
                      {avatarInitial}
                    </span>
                  )}
                </div>
              )}

              {onSignOut ? (
                <button
                  type="button"
                  onClick={() => {
                    void onSignOut();
                  }}
                  disabled={signOutDisabled}
                  className="h-[34px] rounded-full px-3 text-[12px] font-semibold disabled:cursor-default disabled:opacity-60"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                  }}
                >
                  {signOutDisabled ? "Signing out..." : "Sign out"}
                </button>
              ) : null}
            </div>
          ) : (
            <div className="h-[34px] w-[34px]" />
          )}
        </div>
      </div>
    </header>
  );
}
