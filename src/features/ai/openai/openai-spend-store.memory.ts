import type {
  OpenAiSpendStore,
  ReserveOpenAiBudgetInput,
  ReserveOpenAiBudgetResult,
} from "@/features/ai/openai/openai-spend-store";

type MemoryOpenAiSpendState = {
  totalSpentUsd: number;
};

/**
 * Handles round usd.
 */
function roundUsd(value: number): number {
  return Math.max(0, Math.round(value * 1_000_000) / 1_000_000);
}

/**
 * Creates memory openai spend store.
 */
export function createMemoryOpenAiSpendStore(
  seedTotalSpentUsd = 0,
): OpenAiSpendStore {
  const state: MemoryOpenAiSpendState = {
    totalSpentUsd: roundUsd(seedTotalSpentUsd),
  };

  /**
   * Handles reserve budget.
   */
  const reserveBudget = async (
    input: ReserveOpenAiBudgetInput,
  ): Promise<ReserveOpenAiBudgetResult> => {
    const reserveUsd = roundUsd(input.reserveUsd);
    if (state.totalSpentUsd + reserveUsd > input.hardLimitUsd) {
      return {
        ok: false,
        totalSpentUsd: roundUsd(state.totalSpentUsd),
      };
    }

    state.totalSpentUsd = roundUsd(state.totalSpentUsd + reserveUsd);
    return {
      ok: true,
      totalSpentUsd: roundUsd(state.totalSpentUsd),
    };
  };

  /**
   * Handles release budget.
   */
  const releaseBudget = async (reservedUsd: number): Promise<void> => {
    state.totalSpentUsd = roundUsd(
      state.totalSpentUsd - roundUsd(Math.max(0, reservedUsd)),
    );
  };

  /**
   * Handles finalize budget.
   */
  const finalizeBudget = async (input: {
    reservedUsd: number;
    actualUsd: number;
  }): Promise<{ totalSpentUsd: number }> => {
    const reservedUsd = roundUsd(Math.max(0, input.reservedUsd));
    const actualUsd = roundUsd(Math.max(0, input.actualUsd));
    state.totalSpentUsd = roundUsd(
      state.totalSpentUsd - reservedUsd + actualUsd,
    );
    return {
      totalSpentUsd: roundUsd(state.totalSpentUsd),
    };
  };

  return {
    reserveBudget,
    releaseBudget,
    finalizeBudget,
  };
}
