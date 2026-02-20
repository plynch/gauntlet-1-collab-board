import { expect, test, type Locator, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";
const hasOpenAiKey =
  typeof process.env.OPENAI_API_KEY === "string" &&
  process.env.OPENAI_API_KEY.trim().length > 0;
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
};

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test.skip(
  !hasOpenAiKey,
  "OPENAI_API_KEY is missing. This paid suite is on-demand and key-gated.",
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
  };
  expect(openAiPayload.ready).toBe(true);
  expect(openAiPayload.model).toBe("gpt-4.1-nano");
});

test.afterAll(() => {
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
  expect(response.ok()).toBeTruthy();

  const payload = (await response.json()) as {
    traceId?: unknown;
    provider?: unknown;
    mode?: unknown;
  };
  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
  const provider = typeof payload.provider === "string" ? payload.provider : "";
  const mode = typeof payload.mode === "string" ? payload.mode : "";

  expect(traceId.length).toBeGreaterThan(0);
  expect(provider).toBe("openai");
  expect(mode).toBe("llm");

  traceIds.push(traceId);
  console.log(
    `[langfuse-trace] case=${caseId} traceId=${traceId} dashboard=${LANGFUSE_DASHBOARD_URL}`,
  );

  return { traceId, provider, mode };
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
    "Create one yellow sticky note at x 140 y 180 with text OpenAI smoke case one.",
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
