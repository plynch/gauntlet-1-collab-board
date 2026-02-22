import { FieldValue } from "firebase-admin/firestore";

import type {
  OpenAiSpendStore,
  ReserveOpenAiBudgetInput,
  ReserveOpenAiBudgetResult,
} from "@/features/ai/openai/openai-spend-store";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

const OPENAI_BUDGET_DOC_PATH = "system/aiBudget";

function getOpenAiSpentFromRaw(raw: unknown): number {
  if (!raw || typeof raw !== "object") {
    return 0;
  }

  const value = (raw as { openAiSpentUsd?: unknown }).openAiSpentUsd;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }

  return value;
}

function roundUsd(value: number): number {
  return Math.max(0, Math.round(value * 1_000_000) / 1_000_000);
}

export function createFirestoreOpenAiSpendStore(): OpenAiSpendStore {
  const budgetRef = getFirebaseAdminDb().doc(OPENAI_BUDGET_DOC_PATH);

    const reserveBudget = async (
    input: ReserveOpenAiBudgetInput,
  ): Promise<ReserveOpenAiBudgetResult> => {
    const reserveUsd = roundUsd(Math.max(0, input.reserveUsd));
    let result: ReserveOpenAiBudgetResult = {
      ok: false,
      totalSpentUsd: 0,
    };

    await getFirebaseAdminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(budgetRef);
      const currentSpent = roundUsd(getOpenAiSpentFromRaw(snapshot.data()));
      const nextSpent = roundUsd(currentSpent + reserveUsd);

      if (nextSpent > input.hardLimitUsd) {
        result = {
          ok: false,
          totalSpentUsd: currentSpent,
        };
        return;
      }

      transaction.set(
        budgetRef,
        {
          openAiSpentUsd: nextSpent,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      result = {
        ok: true,
        totalSpentUsd: nextSpent,
      };
    });

    return result;
  };

    const releaseBudget = async (reservedUsd: number): Promise<void> => {
    const reserved = roundUsd(Math.max(0, reservedUsd));
    if (reserved <= 0) {
      return;
    }

    await getFirebaseAdminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(budgetRef);
      const currentSpent = roundUsd(getOpenAiSpentFromRaw(snapshot.data()));
      const nextSpent = roundUsd(currentSpent - reserved);
      transaction.set(
        budgetRef,
        {
          openAiSpentUsd: nextSpent,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });
  };

    const finalizeBudget = async (input: {
    reservedUsd: number;
    actualUsd: number;
  }): Promise<{ totalSpentUsd: number }> => {
    const reservedUsd = roundUsd(Math.max(0, input.reservedUsd));
    const actualUsd = roundUsd(Math.max(0, input.actualUsd));
    let totalSpentUsd = 0;

    await getFirebaseAdminDb().runTransaction(async (transaction) => {
      const snapshot = await transaction.get(budgetRef);
      const currentSpent = roundUsd(getOpenAiSpentFromRaw(snapshot.data()));
      const nextSpent = roundUsd(currentSpent - reservedUsd + actualUsd);
      totalSpentUsd = nextSpent;
      transaction.set(
        budgetRef,
        {
          openAiSpentUsd: nextSpent,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    });

    return {
      totalSpentUsd,
    };
  };

  return {
    reserveBudget,
    releaseBudget,
    finalizeBudget,
  };
}
