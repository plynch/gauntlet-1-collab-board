/**
 * @vitest-environment node
 */

import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const originalAiEnableOpenAi = process.env.AI_ENABLE_OPENAI;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiModel = process.env.OPENAI_MODEL;

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
});

describe("GET /api/e2e/openai-ready", () => {
  it("returns ready false when key is missing", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    delete process.env.OPENAI_API_KEY;

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ready?: unknown;
      model?: unknown;
      reason?: unknown;
    };
    expect(payload.ready).toBe(false);
    expect(payload.model).toBe("gpt-4.1-nano");
    expect(payload.reason).toBe("OPENAI_API_KEY is missing or empty server-side.");
  });

  it("returns ready true when openai is enabled and configured", async () => {
    process.env.AI_ENABLE_OPENAI = "true";
    process.env.OPENAI_API_KEY = "test-openai-key";
    process.env.OPENAI_MODEL = "gpt-4.1-nano";

    const response = await GET();
    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      ready?: unknown;
      model?: unknown;
      reason?: unknown;
    };
    expect(payload.ready).toBe(true);
    expect(payload.model).toBe("gpt-4.1-nano");
    expect(payload.reason).toBeNull();
  });
});
