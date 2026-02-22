import { describe, expect, it } from "vitest";

import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";

describe("toBoardErrorMessage", () => {
  it("normalizes known auth and sync error codes", () => {
    expect(toBoardErrorMessage({ code: "permission-denied" }, "fallback")).toBe(
      "Your access to this board changed. Refresh or return to My Boards.",
    );
    expect(toBoardErrorMessage({ code: "unauthenticated" }, "fallback")).toBe(
      "Your session expired. Please sign in again.",
    );
    expect(toBoardErrorMessage({ code: "unavailable" }, "fallback")).toBe(
      "Realtime sync is temporarily unavailable. Please try again.",
    );
  });

  it("falls back for unknown errors", () => {
    expect(toBoardErrorMessage({ code: "unknown" }, "fallback")).toBe("fallback");
    expect(toBoardErrorMessage(null, "fallback")).toBe("fallback");
  });
});
