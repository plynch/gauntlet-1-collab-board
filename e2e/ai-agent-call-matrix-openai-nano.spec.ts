import { expect, test } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";
const hasOpenAiKey =
  typeof process.env.OPENAI_API_KEY === "string" &&
  process.env.OPENAI_API_KEY.trim().length > 0;

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test.skip(
  !hasOpenAiKey,
  "OPENAI_API_KEY is missing. This paid suite is on-demand and key-gated.",
);

test("openai nano matrix scaffold is configured", async () => {
  expect(process.env.OPENAI_MODEL).toBe("gpt-4.1-nano");
  expect(process.env.AI_ENABLE_OPENAI).toBe("true");
});
