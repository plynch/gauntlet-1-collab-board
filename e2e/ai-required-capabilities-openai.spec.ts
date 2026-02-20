import { expect, test, type Locator, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test.describe.configure({ mode: "serial" });

const LANGFUSE_DASHBOARD_URL =
  "https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv";
const requiredTraceIds: string[] = [];
const runSeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

type UserIdentity = {
  uid: string;
  email: string;
};

/**
 * Handles sanitize user key.
 */
function sanitizeUserKey(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return sanitized.length > 0 ? sanitized : "e2e-user";
}

/**
 * Creates user identity for case.
 */
function createUserIdentity(caseId: string): UserIdentity {
  const uid = sanitizeUserKey(`e2e-required-${caseId}-${runSeed}`);
  return {
    uid,
    email: `${uid}@e2e.local`,
  };
}

test.beforeAll(async ({ request }) => {
  const langfuseResponse = await request.get("/api/e2e/langfuse-ready");
  expect(langfuseResponse.ok()).toBeTruthy();
  const langfusePayload = (await langfuseResponse.json()) as {
    ready?: unknown;
    baseUrl?: unknown;
  };
  if (langfusePayload.ready !== true) {
    throw new Error(
      `Langfuse is not configured server-side (baseUrl=${String(langfusePayload.baseUrl ?? "(unset)")}).`,
    );
  }

  const openAiResponse = await request.get("/api/e2e/openai-ready");
  expect(openAiResponse.ok()).toBeTruthy();
  const openAiPayload = (await openAiResponse.json()) as {
    ready?: unknown;
    model?: unknown;
    plannerMode?: unknown;
    runtime?: unknown;
    reason?: unknown;
  };
  if (openAiPayload.ready !== true) {
    const reason =
      typeof openAiPayload.reason === "string"
        ? openAiPayload.reason
        : "OpenAI planner is not ready server-side.";
    throw new Error(
      [
        reason,
        "Set OPENAI_API_KEY, AI_ENABLE_OPENAI=true, AI_PLANNER_MODE=openai-strict, OPENAI_RUNTIME=agents-sdk.",
      ].join("\n"),
    );
  }

  expect(openAiPayload.model).toBe("gpt-4.1-nano");
  expect(openAiPayload.plannerMode).toBe("openai-strict");
  expect(openAiPayload.runtime).toBe("agents-sdk");
});

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

  await page.getByRole("button", { name: "Create New Board" }).click();
  await page.getByPlaceholder("Board title").fill(boardTitle);
  await page.getByRole("button", { name: "Create board" }).click();

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
 * Gets board objects.
 */
function getBoardObjects(page: Page): Locator {
  return page.locator("article[data-board-object='true']");
}

/**
 * Handles select first object count.
 */
async function selectFirstObjectCount(page: Page, count: number): Promise<void> {
  const objects = getBoardObjects(page);
  const total = await objects.count();
  expect(total).toBeGreaterThanOrEqual(count);

  await objects.nth(0).click({ position: { x: 16, y: 16 } });
  for (let index = 1; index < count; index += 1) {
    await objects.nth(index).click({
      modifiers: ["Shift"],
      position: { x: 16, y: 16 },
    });
  }
  await expect(
    page.getByText(new RegExp(`Selected:\\s*${count}`, "i")).first(),
  ).toBeVisible();
}

/**
 * Handles send ai command.
 */
async function sendAiCommand(
  page: Page,
  commandId: string,
  message: string,
  trackAsRequired = true,
): Promise<void> {
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
    execution?: {
      openAi?: {
        status?: unknown;
        model?: unknown;
      };
    };
  };

  if (!response.ok) {
    const errorMessage =
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : `HTTP ${response.status()}`;
    throw new Error(
      `Required command failed for ${commandId} (${response.status()}): ${errorMessage}`,
    );
  }

  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
  const provider = typeof payload.provider === "string" ? payload.provider : "";
  const mode = typeof payload.mode === "string" ? payload.mode : "";
  const openAiStatus =
    typeof payload.execution?.openAi?.status === "string"
      ? payload.execution.openAi.status
      : "";
  const openAiModel =
    typeof payload.execution?.openAi?.model === "string"
      ? payload.execution.openAi.model
      : "";

  expect(traceId.length).toBeGreaterThan(0);
  expect(provider).toBe("openai");
  expect(mode).toBe("llm");
  expect(openAiStatus).toBe("planned");
  expect(openAiModel).toBe("gpt-4.1-nano");

  if (trackAsRequired) {
    requiredTraceIds.push(traceId);
    console.log(
      `[langfuse-trace] required=${commandId} traceId=${traceId} dashboard=${LANGFUSE_DASHBOARD_URL}`,
    );
  }
}

test.afterAll(() => {
  expect(requiredTraceIds).toHaveLength(12);
  expect(new Set(requiredTraceIds).size).toBe(12);
});

test("required capabilities: openai agent command catalog", async ({ page }) => {
  const caseId = "required-capabilities";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "creation-1",
    "Add a yellow sticky note that says 'User Research'",
  );
  await sendAiCommand(
    page,
    "creation-2",
    "Create a blue rectangle at position 100, 200",
  );
  await sendAiCommand(
    page,
    "creation-3",
    "Add a frame called 'Sprint Planning'",
  );

  await sendAiCommand(page, "setup-pink", "Create 3 pink sticky notes", false);
  await sendAiCommand(
    page,
    "manipulation-1",
    "Move all the pink sticky notes to the right side",
  );

  await sendAiCommand(
    page,
    "manipulation-2",
    "Resize the frame to fit its contents",
  );
  await sendAiCommand(
    page,
    "manipulation-3",
    "Change the sticky note color to green",
  );

  await selectFirstObjectCount(page, 4);
  await sendAiCommand(
    page,
    "layout-1",
    "Arrange these sticky notes in a grid",
  );

  await sendAiCommand(
    page,
    "layout-2",
    "Create a 2x3 grid of sticky notes for pros and cons",
  );

  await selectFirstObjectCount(page, 6);
  await sendAiCommand(
    page,
    "layout-3",
    "Space these elements evenly",
  );

  await sendAiCommand(
    page,
    "complex-1",
    "Create a SWOT analysis template with four quadrants",
  );
  await sendAiCommand(
    page,
    "complex-2",
    "Build a user journey map with 5 stages",
  );
  await sendAiCommand(
    page,
    "complex-3",
    "Set up a retrospective board with What Went Well, What Didn't, and Action Items columns",
  );
});
