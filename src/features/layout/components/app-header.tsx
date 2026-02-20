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
  titleAction?: ReactNode;
};

/**
 * Handles header back link.
 */
export function HeaderBackLink({ href, label }: HeaderBackLinkProps) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border border-slate-300 bg-slate-50 text-lg text-slate-900 no-underline"
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
  const profileLabel =
    user?.displayName?.trim() || user?.email?.trim() || user?.uid || "Account";
  const avatarInitial = profileLabel[0]?.toUpperCase() ?? "A";

  return (
    <header className="grid min-h-14 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b-2 border-slate-300 px-3.5">
      <div>{leftSlot ?? <div className="h-[34px] w-[34px]" />}</div>

      <h1 className="m-0 text-center text-xl font-bold">
        <span className="inline-flex max-w-full items-center gap-2">
          <span className="overflow-hidden text-ellipsis whitespace-nowrap">
            {title}
          </span>
          {titleAction ? <span className="shrink-0">{titleAction}</span> : null}
        </span>
      </h1>

      <div className="flex min-w-[34px] justify-end">
        {user ? (
          <div className="grid justify-items-end gap-0.5">
            {showAccountLink ? (
              <Link
                href="/account"
                aria-label="Open account settings"
                title="Account settings"
                className="inline-flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-200 text-slate-900 no-underline"
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
                className="inline-flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-200 text-slate-900"
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

            <span
              className="max-w-[min(64vw,920px)] overflow-hidden text-ellipsis whitespace-nowrap text-right text-[11px] leading-[1.1] text-slate-500"
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
                className="h-6 rounded-full border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-900 disabled:cursor-default disabled:opacity-60"
              >
                {signOutDisabled ? "Signing out..." : "Sign out"}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="h-[34px] w-[34px]" />
        )}
      </div>
    </header>
  );
}
