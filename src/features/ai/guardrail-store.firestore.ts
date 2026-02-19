import type { Firestore } from "firebase-admin/firestore";

import type {
  GuardrailLockOptions,
  GuardrailRateLimitOptions,
  GuardrailResult,
  GuardrailStore
} from "@/features/ai/guardrail-store";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

const RATE_LIMIT_COLLECTION = "aiGuardrailRateLimits";
const LOCK_COLLECTION = "aiGuardrailLocks";

function toNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (entry): entry is number => typeof entry === "number" && Number.isFinite(entry)
  );
}

type FirestoreGuardrailStoreOptions = {
  db?: Firestore;
};

export function createFirestoreGuardrailStore(
  options?: FirestoreGuardrailStoreOptions
): GuardrailStore {
  const db = options?.db ?? getFirebaseAdminDb();

  async function checkUserRateLimit(
    input: GuardrailRateLimitOptions
  ): Promise<GuardrailResult> {
    const rateDoc = db.collection(RATE_LIMIT_COLLECTION).doc(input.userId);
    const windowStart = input.nowMs - input.windowMs;

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateDoc);
      const rawTimestamps = toNumberArray(snapshot.data()?.timestamps);
      const nextTimestamps = rawTimestamps.filter(
        (timestamp) => timestamp >= windowStart
      );

      if (nextTimestamps.length >= input.maxCommandsPerWindow) {
        transaction.set(
          rateDoc,
          {
            timestamps: nextTimestamps,
            updatedAtMs: input.nowMs
          },
          { merge: true }
        );
        return {
          ok: false,
          status: 429,
          error: "Too many AI commands. Please wait a minute and retry."
        };
      }

      nextTimestamps.push(input.nowMs);
      transaction.set(
        rateDoc,
        {
          timestamps: nextTimestamps,
          updatedAtMs: input.nowMs
        },
        { merge: true }
      );
      return { ok: true };
    });
  }

  async function acquireBoardCommandLock(
    input: GuardrailLockOptions
  ): Promise<GuardrailResult> {
    const lockDoc = db.collection(LOCK_COLLECTION).doc(input.boardId);

    return db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(lockDoc);
      const expiresAtMs = snapshot.data()?.expiresAtMs;
      const existingExpiresAt =
        typeof expiresAtMs === "number" && Number.isFinite(expiresAtMs)
          ? expiresAtMs
          : 0;

      if (existingExpiresAt > input.nowMs) {
        return {
          ok: false,
          status: 409,
          error: "Another AI command is already running on this board."
        };
      }

      transaction.set(
        lockDoc,
        {
          boardId: input.boardId,
          expiresAtMs: input.nowMs + input.ttlMs,
          updatedAtMs: input.nowMs
        },
        { merge: true }
      );
      return { ok: true };
    });
  }

  async function releaseBoardCommandLock(boardId: string): Promise<void> {
    await db.collection(LOCK_COLLECTION).doc(boardId).delete();
  }

  return {
    checkUserRateLimit,
    acquireBoardCommandLock,
    releaseBoardCommandLock
  };
}
