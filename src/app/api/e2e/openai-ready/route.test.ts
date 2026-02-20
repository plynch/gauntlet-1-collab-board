/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const originalAiEnableOpenAi = process.env.AI_ENABLE_OPENAI;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;
const originalOpenAiReadyValidate = process.env.OPENAI_READY_VALIDATE;
const originalAiPlannerMode = process.env.AI_PLANNER_MODE;
const originalOpenAiRuntime = process.env.OPENAI_RUNTIME;

afterEach(() => {
  if (originalAiEnableOpenAi === undefined) {
    delete process.env.AI_ENABLE_OPENAI;
  } else {
    process.env.AI_ENABLE_OPENAI = originalAiEnableOpenAi;
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

  if (originalOpenAiReadyValidate === undefined) {
    delete process.env.OPENAI_READY_VALIDATE;
  } else {
    process.env.OPENAI_READY_VALIDATE = originalOpenAiReadyValidate;
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
});

describe("GET /api/e2e/openai-ready", () => {
  it("returns ready false when key is missing", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_READY_VALIDATE = "false";
    delete process.env.OPENAI_API_KEY;

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ready?: unknown;
      model?: unknown;
      reason?: unknown;
      runtime?: unknown;
    };
    expect(payload.ready).toBe(false);
    expect(payload.model).toBe("gpt-4.1-nano");
    expect(payload.runtime).toBe("agents-sdk");
    expect(payload.reason).toBe("OPENAI_API_KEY is missing or empty server-side.");
  });

  it("returns ready true when openai is enabled and configured", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_READY_VALIDATE = "false";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-4.1-nano";

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ready?: unknown;
      model?: unknown;
      reason?: unknown;
      runtime?: unknown;
    };
    expect(payload.ready).toBe(true);
    expect(payload.model).toBe("gpt-4.1-nano");
    expect(payload.runtime).toBe("agents-sdk");
    expect(payload.reason).toBeNull();
  });

  it("returns deterministic-only reason when planner mode disables openai", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.AI_PLANNER_MODE = "deterministic-only";
    process.env.OPENAI_READY_VALIDATE = "false";
    process.env.OPENAI_API_KEY = "test-openai-key";

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ready?: unknown;
      reason?: unknown;
      plannerMode?: unknown;
    };
    expect(payload.ready).toBe(false);
    expect(payload.plannerMode).toBe("deterministic-only");
    expect(payload.reason).toBe(
      "AI_PLANNER_MODE=deterministic-only disables OpenAI planner.",
    );
  });

  it("returns runtime override when configured", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_READY_VALIDATE = "false";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_RUNTIME = "chat-completions";

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      runtime?: unknown;
      ready?: unknown;
    };
    expect(payload.ready).toBe(true);
    expect(payload.runtime).toBe("chat-completions");
  });
});
