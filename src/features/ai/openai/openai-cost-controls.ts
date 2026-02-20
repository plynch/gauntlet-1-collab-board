import { createFirestoreOpenAiSpendStore } from "@/features/ai/openai/openai-spend-store.firestore";
import { createMemoryOpenAiSpendStore } from "@/features/ai/openai/openai-spend-store.memory";
import type { OpenAiSpendStore } from "@/features/ai/openai/openai-spend-store";

export const OPENAI_HARD_SPEND_LIMIT_USD = 10;

let openAiSpendStore: OpenAiSpendStore | null = null;

/**
 * Gets openai spend store.
 */
function getOpenAiSpendStore(): OpenAiSpendStore {
  if (openAiSpendStore) {
    return openAiSpendStore;
  }

  openAiSpendStore =
    process.env.AI_GUARDRAIL_STORE === "firestore"
      ? createFirestoreOpenAiSpendStore()
      : createMemoryOpenAiSpendStore();

  return openAiSpendStore;
}

/**
 * Sets openai spend store for tests.
 */
export function setOpenAiSpendStoreForTests(store: OpenAiSpendStore | null): void {
  openAiSpendStore = store;
}

/**
 * Handles round usd.
 */
function roundUsd(value: number): number {
  return Math.max(0, Math.round(value * 1_000_000) / 1_000_000);
}

/**
 * Estimates openai cost from usage.
 */
export function estimateOpenAiCostUsd(input: {
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
}): number {
  const inputCost =
    (Math.max(0, input.inputTokens) / 1_000_000) * input.inputCostPerMillionUsd;
  const outputCost =
    (Math.max(0, input.outputTokens) / 1_000_000) * input.outputCostPerMillionUsd;
  return roundUsd(inputCost + outputCost);
}

/**
 * Handles reserve openai budget.
 */
export async function reserveOpenAiBudget(
  reserveUsd: number,
): Promise<
  | {
      ok: true;
      reservedUsd: number;
      totalSpentUsd: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
      totalSpentUsd: number;
    }
> {
  const reservedUsd = roundUsd(Math.max(0, reserveUsd));
  const result = await getOpenAiSpendStore().reserveBudget({
    reserveUsd: reservedUsd,
    hardLimitUsd: OPENAI_HARD_SPEND_LIMIT_USD,
  });

  if (!result.ok) {
    return {
      ok: false,
      status: 402,
      error: `OpenAI spend limit reached ($${OPENAI_HARD_SPEND_LIMIT_USD.toFixed(2)}). Falling back to deterministic planner.`,
      totalSpentUsd: result.totalSpentUsd,
    };
  }

  return {
    ok: true,
    reservedUsd,
    totalSpentUsd: result.totalSpentUsd,
  };
}

/**
 * Handles release openai budget.
 */
export async function releaseOpenAiBudgetReservation(
  reservedUsd: number,
): Promise<void> {
  await getOpenAiSpendStore().releaseBudget(reservedUsd);
}

/**
 * Handles finalize openai budget reservation.
 */
export async function finalizeOpenAiBudgetReservation(input: {
  reservedUsd: number;
  actualUsd: number;
}): Promise<{ totalSpentUsd: number }> {
  return getOpenAiSpendStore().finalizeBudget(input);
}
