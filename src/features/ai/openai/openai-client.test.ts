import { afterEach, describe, expect, it } from "vitest";

import { getOpenAiPlannerConfig, setOpenAiClientForTests } from "@/features/ai/openai/openai-client";

const originalAiEnableOpenAi = process.env.AI_ENABLE_OPENAI;
const originalAiPlannerMode = process.env.AI_PLANNER_MODE;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;

afterEach(() => {
  setOpenAiClientForTests(undefined);

  if (originalAiEnableOpenAi === undefined) {
    delete process.env.AI_ENABLE_OPENAI;
  } else {
    process.env.AI_ENABLE_OPENAI = originalAiEnableOpenAi;
  }

  if (originalAiPlannerMode === undefined) {
    delete process.env.AI_PLANNER_MODE;
  } else {
    process.env.AI_PLANNER_MODE = originalAiPlannerMode;
  }

  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }

  if (originalOpenAiModel === undefined) {
    delete process.env.OPENAI_MODEL;
  } else {
    process.env.OPENAI_MODEL = originalOpenAiModel;
  }
});

describe("getOpenAiPlannerConfig", () => {
  it("defaults planner mode to openai-with-fallback", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    delete process.env.AI_PLANNER_MODE;

    const config = getOpenAiPlannerConfig();
    expect(config.plannerMode).toBe("openai-with-fallback");
    expect(config.enabled).toBe(true);
  });

  it("disables openai in deterministic-only planner mode", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.AI_PLANNER_MODE = "deterministic-only";

    const config = getOpenAiPlannerConfig();
    expect(config.plannerMode).toBe("deterministic-only");
    expect(config.enabled).toBe(false);
  });

  it("accepts openai-strict mode", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.AI_PLANNER_MODE = "openai-strict";
    process.env.OPENAI_MODEL = "gpt-4.1-nano";

    const config = getOpenAiPlannerConfig();
    expect(config.plannerMode).toBe("openai-strict");
    expect(config.enabled).toBe(true);
    expect(config.model).toBe("gpt-4.1-nano");
  });
});
