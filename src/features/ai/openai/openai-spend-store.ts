export type ReserveOpenAiBudgetInput = {
  reserveUsd: number;
  hardLimitUsd: number;
};

export type ReserveOpenAiBudgetResult =
  | {
      ok: true;
      totalSpentUsd: number;
    }
  | {
      ok: false;
      totalSpentUsd: number;
    };

export type OpenAiSpendStore = {
  reserveBudget(input: ReserveOpenAiBudgetInput): Promise<ReserveOpenAiBudgetResult>;
  releaseBudget(reservedUsd: number): Promise<void>;
  finalizeBudget(input: {
    reservedUsd: number;
    actualUsd: number;
  }): Promise<{
    totalSpentUsd: number;
  }>;
};
