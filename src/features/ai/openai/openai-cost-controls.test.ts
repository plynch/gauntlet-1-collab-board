import { afterEach, describe, expect, it } from "vitest";

import {
  estimateOpenAiCostUsd,
  finalizeOpenAiBudgetReservation,
  reserveOpenAiBudget,
  setOpenAiSpendStoreForTests,
} from "@/features/ai/openai/openai-cost-controls";
import { createMemoryOpenAiSpendStore } from "@/features/ai/openai/openai-spend-store.memory";

afterEach(() => {
  setOpenAiSpendStoreForTests(null);
});

describe("estimateOpenAiCostUsd", () => {
  it("computes input and output token costs", () => {
    const cost = estimateOpenAiCostUsd({
      inputTokens: 100_000,
      outputTokens: 50_000,
      inputCostPerMillionUsd: 0.1,
      outputCostPerMillionUsd: 0.4,
    });

    expect(cost).toBeCloseTo(0.03, 6);
  });
});

describe("openai budget reservation", () => {
  it("blocks requests that exceed hard cap", async () => {
    setOpenAiSpendStoreForTests(createMemoryOpenAiSpendStore(9.99));

    const result = await reserveOpenAiBudget(0.05);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(402);
    }
  });

  it("finalizes reserved budget to actual usage", async () => {
    setOpenAiSpendStoreForTests(createMemoryOpenAiSpendStore(1));

    const reserved = await reserveOpenAiBudget(0.05);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) {
      return;
    }

    const finalized = await finalizeOpenAiBudgetReservation({
      reservedUsd: reserved.reservedUsd,
      actualUsd: 0.012,
    });

    expect(finalized.totalSpentUsd).toBeCloseTo(1.012, 6);
  });
});
