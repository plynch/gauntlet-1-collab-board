import type {
  GuardrailLockOptions,
  GuardrailRateLimitOptions,
  GuardrailResult,
  GuardrailStore
} from "@/features/ai/guardrail-store";

type RateWindow = {
  timestamps: number[];
};

type MemoryGuardrailStoreOptions = {
  userRateWindows?: Map<string, RateWindow>;
  boardLocks?: Map<string, number>;
};

export function createMemoryGuardrailStore(
  options?: MemoryGuardrailStoreOptions
): GuardrailStore {
  const userRateWindows = options?.userRateWindows ?? new Map<string, RateWindow>();
  const boardLocks = options?.boardLocks ?? new Map<string, number>();

  async function checkUserRateLimit(
    input: GuardrailRateLimitOptions
  ): Promise<GuardrailResult> {
    const windowStart = input.nowMs - input.windowMs;
    const current = userRateWindows.get(input.userId) ?? { timestamps: [] };
    const nextTimestamps = current.timestamps.filter(
      (timestamp) => timestamp >= windowStart
    );

    if (nextTimestamps.length >= input.maxCommandsPerWindow) {
      userRateWindows.set(input.userId, { timestamps: nextTimestamps });
      return {
        ok: false,
        status: 429,
        error: "Too many AI commands. Please wait a minute and retry."
      };
    }

    nextTimestamps.push(input.nowMs);
    userRateWindows.set(input.userId, { timestamps: nextTimestamps });
    return { ok: true };
  }

  async function acquireBoardCommandLock(
    input: GuardrailLockOptions
  ): Promise<GuardrailResult> {
    const existingExpiresAt = boardLocks.get(input.boardId) ?? 0;
    if (existingExpiresAt > input.nowMs) {
      return {
        ok: false,
        status: 409,
        error: "Another AI command is already running on this board."
      };
    }

    boardLocks.set(input.boardId, input.nowMs + input.ttlMs);
    return { ok: true };
  }

  async function releaseBoardCommandLock(boardId: string): Promise<void> {
    boardLocks.delete(boardId);
  }

  return {
    checkUserRateLimit,
    acquireBoardCommandLock,
    releaseBoardCommandLock
  };
}
