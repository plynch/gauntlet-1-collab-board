import { useEffect, useState } from "react";

import type { PresenceUser } from "@/features/boards/types";

export function usePresenceClock(intervalMs = 1_000): number {
  const [presenceClock, setPresenceClock] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setPresenceClock(Date.now());
    }, intervalMs);

    return () => {
      window.clearInterval(timerId);
    };
  }, [intervalMs]);

  return presenceClock;
}

export function getPresenceLabel(user: PresenceUser): string {
  return user.displayName ?? user.email ?? user.uid;
}

export function getActivePresenceUsers(
  users: PresenceUser[],
  nowMs: number,
  ttlMs: number
): PresenceUser[] {
  return users.filter((presenceUser) => {
    if (!presenceUser.active) {
      return false;
    }

    if (!presenceUser.lastSeenAt) {
      return false;
    }

    return nowMs - presenceUser.lastSeenAt <= ttlMs;
  });
}

export function getRemoteCursors(
  users: PresenceUser[],
  currentUserId: string
): PresenceUser[] {
  return users.filter(
    (presenceUser) =>
      presenceUser.uid !== currentUserId &&
      presenceUser.cursorX !== null &&
      presenceUser.cursorY !== null
  );
}
