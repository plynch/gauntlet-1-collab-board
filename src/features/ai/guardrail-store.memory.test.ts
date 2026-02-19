import { describe, expect, it } from "vitest";

import { createMemoryGuardrailStore } from "@/features/ai/guardrail-store.memory";

describe("createMemoryGuardrailStore", () => {
  it("enforces per-user rate limit and resets outside the window", async () => {
    const store = createMemoryGuardrailStore();
    const nowMs = Date.now();

    for (let index = 0; index < 3; index += 1) {
      const allowed = await store.checkUserRateLimit({
        userId: "user-1",
        nowMs: nowMs + index,
        windowMs: 1_000,
        maxCommandsPerWindow: 3,
      });
      expect(allowed.ok).toBe(true);
    }

    const blocked = await store.checkUserRateLimit({
      userId: "user-1",
      nowMs: nowMs + 4,
      windowMs: 1_000,
      maxCommandsPerWindow: 3,
    });
    expect(blocked.ok).toBe(false);

    const allowedAfterWindow = await store.checkUserRateLimit({
      userId: "user-1",
      nowMs: nowMs + 2_000,
      windowMs: 1_000,
      maxCommandsPerWindow: 3,
    });
    expect(allowedAfterWindow.ok).toBe(true);
  });

  it("allows lock reacquisition after ttl expiry", async () => {
    const store = createMemoryGuardrailStore();
    const nowMs = Date.now();

    const first = await store.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs,
      ttlMs: 100,
    });
    const second = await store.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs: nowMs + 50,
      ttlMs: 100,
    });
    const third = await store.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs: nowMs + 120,
      ttlMs: 100,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(true);
  });
});
