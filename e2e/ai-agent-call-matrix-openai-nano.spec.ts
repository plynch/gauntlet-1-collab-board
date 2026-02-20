import { expect, test, type Locator, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";
const LANGFUSE_DASHBOARD_URL =
  "https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv";
const traceIds: string[] = [];
const runSeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

type UserIdentity = {
  uid: string;
  email: string;
};

type AiCommandResult = {
  traceId: string;
  provider: string;
  mode: string;
  openAiStatus: string;
  openAiModel: string;
  openAiEstimatedCostUsd: number;
};

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ request }) => {
  const langfuseResponse = await request.get("/api/e2e/langfuse-ready");
  expect(langfuseResponse.ok()).toBeTruthy();
  const langfusePayload = (await langfuseResponse.json()) as {
    ready?: unknown;
  };
  expect(langfusePayload.ready).toBe(true);

  const openAiResponse = await request.get("/api/e2e/openai-ready");
  expect(openAiResponse.ok()).toBeTruthy();
  const openAiPayload = (await openAiResponse.json()) as {
    ready?: unknown;
    model?: unknown;
    reason?: unknown;
  };

  if (openAiPayload.ready !== true) {
    const reason =
      typeof openAiPayload.reason === "string" && openAiPayload.reason.length > 0
        ? openAiPayload.reason
        : "OpenAI planner is not ready server-side.";
    throw new Error([
      reason,
      "Set OPENAI_API_KEY in .env.local and ensure AI_ENABLE_OPENAI=true.",
      "Restart the dev server, then rerun:",
      "npm run test:e2e:ai-openai-smoke:nano:PAID",
    ].join("\n"));
  }

  expect(openAiPayload.model).toBe("gpt-4.1-nano");
});

test.afterAll(() => {
  if (traceIds.length === 0) {
    return;
  }
  expect(traceIds).toHaveLength(2);
  expect(new Set(traceIds).size).toBe(2);
});

/**
 * Handles sanitize user key.
 */
function sanitizeUserKey(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return sanitized.length > 0 ? sanitized : "e2e-openai-user";
}

/**
 * Creates user identity for case.
 */
function createUserIdentity(caseId: string): UserIdentity {
  const uid = sanitizeUserKey(`e2e-openai-${caseId}-${runSeed}`);
  return {
    uid,
    email: `${uid}@e2e.local`,
  };
}

/**
 * Gets board objects.
 */
function getBoardObjects(page: Page): Locator {
  return page.locator("article[data-board-object='true']");
}

/**
 * Handles create board and open.
 */
async function createBoardAndOpen(
  page: Page,
  caseId: string,
  boardTitle: string,
): Promise<void> {
  const identity = createUserIdentity(caseId);
  const loginUrl = `/e2e/emulator-login?uid=${encodeURIComponent(identity.uid)}&email=${encodeURIComponent(identity.email)}`;
  await page.goto(loginUrl);
  await page.getByTestId("emulator-login-button").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(/Signed in as/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: /My Boards/ })).toBeVisible();

  await page.getByRole("button", { name: "Create New Board" }).click();
  await page.getByPlaceholder("Board title").fill(boardTitle);
  const createBoardButton = page.getByRole("button", { name: "Create board" });

  let boardCreated = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const createResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/boards") &&
          response.request().method() === "POST",
        {
          timeout: 4_000,
        },
      )
      .catch(() => null);

    await createBoardButton.click();
    const createResponse = await createResponsePromise;
    if (!createResponse) {
      await page.waitForTimeout(250);
      continue;
    }

    if (createResponse.ok()) {
      boardCreated = true;
      break;
    }

    if (createResponse.status() === 401 && attempt < 2) {
      await page.waitForTimeout(350);
      continue;
    }

    throw new Error(
      `Create board failed with status ${createResponse.status()} for ${boardTitle}.`,
    );
  }

  expect(boardCreated).toBe(true);

  await expect(page.getByText(boardTitle)).toBeVisible();
  await page.getByRole("link", { name: `Open board ${boardTitle}` }).click();
  await expect(page).toHaveURL(/\/boards\//);
}

/**
 * Handles ensure ai input visible.
 */
async function ensureAiInputVisible(page: Page): Promise<void> {
  const aiInput = page.getByPlaceholder("Ask AI agent...");
  if (await aiInput.isVisible()) {
    return;
  }

  await page
    .getByRole("button", { name: "Expand AI assistant drawer" })
    .click();
  await expect(aiInput).toBeVisible();
}

/**
 * Handles send ai command.
 */
async function sendAiCommand(
  page: Page,
  caseId: string,
  message: string,
): Promise<AiCommandResult> {
  await ensureAiInputVisible(page);

  const aiInput = page.getByPlaceholder("Ask AI agent...");
  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/ai/board-command") &&
      response.request().method() === "POST",
  );

  await aiInput.fill(message);
  await page.getByRole("button", { name: "Send" }).click();

  const response = await responsePromise;
  const payload = (await response.json()) as {
    error?: unknown;
    traceId?: unknown;
    provider?: unknown;
    mode?: unknown;
    assistantMessage?: unknown;
    execution?: {
      openAi?: {
        status?: unknown;
        model?: unknown;
        estimatedCostUsd?: unknown;
      };
    };
  };

  if (!response.ok()) {
    const errorMessage =
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : `HTTP ${response.status()} with non-OK AI response.`;
    throw new Error(
      `AI command failed for ${caseId} (${response.status()}): ${errorMessage}`,
    );
  }

  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
  const provider = typeof payload.provider === "string" ? payload.provider : "";
  const mode = typeof payload.mode === "string" ? payload.mode : "";
  const assistantMessage =
    typeof payload.assistantMessage === "string" ? payload.assistantMessage : "";
  const openAiStatus =
    typeof payload.execution?.openAi?.status === "string"
      ? payload.execution.openAi.status
      : "";
  const openAiModel =
    typeof payload.execution?.openAi?.model === "string"
      ? payload.execution.openAi.model
      : "";
  const openAiEstimatedCostUsd =
    typeof payload.execution?.openAi?.estimatedCostUsd === "number" &&
    Number.isFinite(payload.execution.openAi.estimatedCostUsd)
      ? payload.execution.openAi.estimatedCostUsd
      : -1;

  expect(traceId.length).toBeGreaterThan(0);
  if (provider !== "openai" || mode !== "llm") {
    throw new Error(
      [
        `Expected OpenAI llm response for ${caseId}, got provider=${provider || "(missing)"} mode=${mode || "(missing)"}.`,
        `assistantMessage=${assistantMessage || "(missing)"}`,
        `execution=${JSON.stringify(payload.execution ?? null)}`,
        `traceId=${traceId || "(missing)"}`,
      ].join("\n"),
    );
  }
  expect(openAiStatus).toBe("planned");
  expect(openAiModel).toBe("gpt-4.1-nano");
  expect(openAiEstimatedCostUsd).toBeGreaterThanOrEqual(0);

  traceIds.push(traceId);
  console.log(
    `[langfuse-trace] case=${caseId} traceId=${traceId} dashboard=${LANGFUSE_DASHBOARD_URL}`,
  );

  return {
    traceId,
    provider,
    mode,
    openAiStatus,
    openAiModel,
    openAiEstimatedCostUsd,
  };
}

test("case 01: openai creates sticky", async ({ page }) => {
  await createBoardAndOpen(
    page,
    "case-01",
    `OpenAI E2E case-01 ${Date.now()}`,
  );

  const objects = getBoardObjects(page);
  const initialCount = await objects.count();

  await sendAiCommand(
    page,
    "openai-case-01",
    "Place one yellow sticky note at x 140 y 180 saying OpenAI smoke case one.",
  );

  await expect(objects).toHaveCount(initialCount + 1);
});

test("case 02: openai creates line shape", async ({ page }) => {
  await createBoardAndOpen(
    page,
    "case-02",
    `OpenAI E2E case-02 ${Date.now()}`,
  );

  const objects = getBoardObjects(page);
  const initialCount = await objects.count();

  await sendAiCommand(
    page,
    "openai-case-02",
    "Create one line shape at x 220 y 220 with width 260 and height 24 in gray.",
  );

  await expect(objects).toHaveCount(initialCount + 1);
});
