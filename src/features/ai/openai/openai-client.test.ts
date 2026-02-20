import { afterEach, describe, expect, it } from "vitest";

import { getOpenAiPlannerConfig, setOpenAiClientForTests } from "@/features/ai/openai/openai-client";

const originalAiEnableOpenAi = process.env.AI_ENABLE_OPENAI;
const originalAiPlannerMode = process.env.AI_PLANNER_MODE;
const originalOpenAiRuntime = process.env.OPENAI_RUNTIME;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;
const originalOpenAiAgentsMaxTurns = process.env.OPENAI_AGENTS_MAX_TURNS;
const originalOpenAiAgentsTracing = process.env.OPENAI_AGENTS_TRACING;
const originalOpenAiAgentsTracingApiKey =
  process.env.OPENAI_AGENTS_TRACING_API_KEY;
const originalOpenAiTracingApiKey = process.env.OPENAI_TRACING_API_KEY;
const originalOpenAiAgentsWorkflowName =
  process.env.OPENAI_AGENTS_WORKFLOW_NAME;

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

  if (originalOpenAiRuntime === undefined) {
    delete process.env.OPENAI_RUNTIME;
  } else {
    process.env.OPENAI_RUNTIME = originalOpenAiRuntime;
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

  if (originalOpenAiAgentsMaxTurns === undefined) {
    delete process.env.OPENAI_AGENTS_MAX_TURNS;
  } else {
    process.env.OPENAI_AGENTS_MAX_TURNS = originalOpenAiAgentsMaxTurns;
  }

  if (originalOpenAiAgentsTracing === undefined) {
    delete process.env.OPENAI_AGENTS_TRACING;
  } else {
    process.env.OPENAI_AGENTS_TRACING = originalOpenAiAgentsTracing;
  }

  if (originalOpenAiAgentsTracingApiKey === undefined) {
    delete process.env.OPENAI_AGENTS_TRACING_API_KEY;
  } else {
    process.env.OPENAI_AGENTS_TRACING_API_KEY =
      originalOpenAiAgentsTracingApiKey;
  }

  if (originalOpenAiTracingApiKey === undefined) {
    delete process.env.OPENAI_TRACING_API_KEY;
  } else {
    process.env.OPENAI_TRACING_API_KEY = originalOpenAiTracingApiKey;
  }

  if (originalOpenAiAgentsWorkflowName === undefined) {
    delete process.env.OPENAI_AGENTS_WORKFLOW_NAME;
  } else {
    process.env.OPENAI_AGENTS_WORKFLOW_NAME = originalOpenAiAgentsWorkflowName;
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

  it("defaults runtime to agents-sdk", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    delete process.env.OPENAI_RUNTIME;

    const config = getOpenAiPlannerConfig();
    expect(config.runtime).toBe("agents-sdk");
  });

  it("accepts chat-completions runtime override", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_RUNTIME = "chat-completions";

    const config = getOpenAiPlannerConfig();
    expect(config.runtime).toBe("chat-completions");
  });

  it("parses boolean tracing env values flexibly", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_AGENTS_TRACING = "off";
    process.env.AI_PLANNER_MODE = "openai-strict";
    expect(getOpenAiPlannerConfig().agentsTracing).toBe(false);

    process.env.OPENAI_AGENTS_TRACING = "1";
    expect(getOpenAiPlannerConfig().agentsTracing).toBe(true);
  });

  it("parses agents runtime tuning envs", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_AGENTS_MAX_TURNS = "12";
    process.env.OPENAI_AGENTS_TRACING = "false";
    process.env.OPENAI_AGENTS_WORKFLOW_NAME = "custom-workflow";
    process.env.OPENAI_AGENTS_TRACING_API_KEY = "test-tracing-key";

    const config = getOpenAiPlannerConfig();
    expect(config.agentsMaxTurns).toBe(12);
    expect(config.agentsTracing).toBe(false);
    expect(config.agentsWorkflowName).toBe("custom-workflow");
    expect(config.agentsTracingApiKey).toBe("test-tracing-key");
  });

  it("falls back to legacy OPENAI_TRACING_API_KEY for tracing override", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_TRACING_API_KEY = "legacy-tracing-key";

    const config = getOpenAiPlannerConfig();
    expect(config.agentsTracingApiKey).toBe("legacy-tracing-key");
  });

  it("falls back to OPENAI_API_KEY for tracing override", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.AI_ENABLE_OPENAI = "true";

    const config = getOpenAiPlannerConfig();
    expect(config.agentsTracingApiKey).toBe("test-openai-key");
  });
});
