/**
 * Normalizes realtime board errors for user-safe display.
 */
export function toBoardErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
    };

    const code = typeof candidate.code === "string" ? candidate.code : null;

    if (code === "permission-denied") {
      return "Your access to this board changed. Refresh or return to My Boards.";
    }

    if (code === "unauthenticated") {
      return "Your session expired. Please sign in again.";
    }

    if (code === "unavailable" || code === "deadline-exceeded") {
      return "Realtime sync is temporarily unavailable. Please try again.";
    }

    return fallback;
  }

  return fallback;
}
