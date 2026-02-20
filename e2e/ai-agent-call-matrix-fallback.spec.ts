import { expect, test, type Locator, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test.describe.configure({ mode: "serial" });

const LANGFUSE_DASHBOARD_URL =
  "https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv";
const traceIds: string[] = [];

const runSeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

type AiCommandResult = {
  assistantMessage: string;
  traceId: string;
  intent: string;
  provider: string;
};

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
  const uid = sanitizeUserKey(`e2e-${caseId}-${runSeed}`);
  return {
    uid,
    email: `${uid}@e2e.local`,
  };
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
  await expect(page.getByRole("heading", { name: /My Boards/ })).toBeVisible();

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
    assistantMessage?: unknown;
    traceId?: unknown;
    execution?: { intent?: unknown };
    provider?: unknown;
  };

  const assistantMessage =
    typeof payload.assistantMessage === "string" ? payload.assistantMessage : "";
  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
  const intent =
    typeof payload.execution?.intent === "string" ? payload.execution.intent : "";
  const provider = typeof payload.provider === "string" ? payload.provider : "";

  expect(traceId.length).toBeGreaterThan(0);
  expect(provider).toBe("deterministic-mcp");

  traceIds.push(traceId);
  console.log(
    `[langfuse-trace] case=${caseId} traceId=${traceId} dashboard=${LANGFUSE_DASHBOARD_URL}`,
  );

  return {
    assistantMessage,
    traceId,
    intent,
    provider,
  };
}

/**
 * Gets board objects.
 */
function getBoardObjects(page: Page): Locator {
  return page.locator("article[data-board-object='true']");
}

/**
 * Gets sticky text areas.
 */
function getStickyTextAreas(page: Page): Locator {
  return page.locator("article[data-board-object='true'] textarea");
}

/**
 * Handles add manual sticky notes.
 */
async function addManualStickyNotes(page: Page, count: number): Promise<void> {
  const objects = getBoardObjects(page);
  const initialCount = await objects.count();

  for (let index = 0; index < count; index += 1) {
    await page.locator("button[title='Add sticky']").first().click();
    await expect(objects).toHaveCount(initialCount + index + 1);
  }
}

/**
 * Handles add manual rectangles.
 */
async function addManualRectangles(page: Page, count: number): Promise<void> {
  const objects = getBoardObjects(page);
  const initialCount = await objects.count();

  for (let index = 0; index < count; index += 1) {
    await page.locator("button[title='Add rectangle']").first().click();
    await expect(objects).toHaveCount(initialCount + index + 1);
  }
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

  await expect(page.getByText(new RegExp(`Selected:\\s*${count}`, "i"))).toBeVisible();
}

/**
 * Handles get board object box.
 */
async function getBoardObjectBox(page: Page, index: number) {
  const box = await getBoardObjects(page).nth(index).boundingBox();
  if (!box) {
    throw new Error(`Could not read board object box at index ${index}.`);
  }
  return box;
}

/**
 * Handles assert command intent.
 */
function assertCommandIntent(result: AiCommandResult, expectedIntent: string): void {
  expect(result.intent).toBe(expectedIntent);
}

test.afterAll(() => {
  expect(traceIds).toHaveLength(20);
  expect(new Set(traceIds).size).toBe(20);
});

test("case 01: create sticky with text", async ({ page }) => {
  const caseId = "case-01";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(
    page,
    caseId,
    "Add a yellow sticky note that says Case 01 note",
  );

  assertCommandIntent(result, "create-sticky");
  expect(result.assistantMessage).toContain("Created sticky note");
  await expect(getStickyTextAreas(page).first()).toHaveValue(/Case 01 note/i);
});

test("case 02: create sticky with coordinates", async ({ page }) => {
  const caseId = "case-02";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(
    page,
    caseId,
    "Add a pink sticky note at position 520, 280 that says Case 02 note",
  );

  assertCommandIntent(result, "create-sticky");
  await expect(getStickyTextAreas(page).first()).toHaveValue(/Case 02 note/i);
});

test("case 03: create sticky batch", async ({ page }) => {
  const caseId = "case-03";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Create 5 red stickies");

  assertCommandIntent(result, "create-sticky-batch");
  expect(result.assistantMessage).toContain("Created 5 sticky notes");
  await expect(getStickyTextAreas(page)).toHaveCount(5);
});

test("case 04: clear board", async ({ page }) => {
  const caseId = "case-04";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 2);
  await addManualRectangles(page, 1);
  await expect(getBoardObjects(page)).toHaveCount(3);

  const result = await sendAiCommand(page, caseId, "Clear the board");

  assertCommandIntent(result, "clear-board");
  await expect(getBoardObjects(page)).toHaveCount(0);
});

test("case 05: create 2x3 sticky grid", async ({ page }) => {
  const caseId = "case-05";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(
    page,
    caseId,
    "Create a 2x3 grid of sticky notes for pros and cons",
  );

  assertCommandIntent(result, "create-sticky-grid");
  await expect(getStickyTextAreas(page)).toHaveCount(6);
});

test("case 06: create 3 by 2 sticky grid", async ({ page }) => {
  const caseId = "case-06";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(
    page,
    caseId,
    "Create a 3 by 2 grid of green sticky notes for sprint risks",
  );

  assertCommandIntent(result, "create-sticky-grid");
  await expect(getStickyTextAreas(page)).toHaveCount(6);
  await expect(getStickyTextAreas(page).first()).toHaveValue(/sprint risks 1/i);
});

test("case 07: create frame", async ({ page }) => {
  const caseId = "case-07";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Add a frame called Sprint Planning");

  assertCommandIntent(result, "create-frame");
  await expect(page.getByText("Sprint Planning").first()).toBeVisible();
});

test("case 08: create rectangle", async ({ page }) => {
  const caseId = "case-08";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(
    page,
    caseId,
    "Create a blue rectangle at position 900, 120",
  );

  assertCommandIntent(result, "create-rect");
  await expect(getBoardObjects(page)).toHaveCount(1);
});

test("case 09: create circle", async ({ page }) => {
  const caseId = "case-09";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Create an orange circle");

  assertCommandIntent(result, "create-circle");
  await expect(getBoardObjects(page)).toHaveCount(1);
});

test("case 10: create triangle", async ({ page }) => {
  const caseId = "case-10";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Create a purple triangle");

  assertCommandIntent(result, "create-triangle");
  await expect(getBoardObjects(page)).toHaveCount(1);
});

test("case 11: create star", async ({ page }) => {
  const caseId = "case-11";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Create a yellow star");

  assertCommandIntent(result, "create-star");
  await expect(getBoardObjects(page)).toHaveCount(1);
});

test("case 12: create SWOT template", async ({ page }) => {
  const caseId = "case-12";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  const result = await sendAiCommand(page, caseId, "Create a SWOT analysis template");

  assertCommandIntent(result, "swot-template");
  expect(result.assistantMessage).toContain("Created SWOT analysis template");
  await expect(page.getByText("Strengths").first()).toBeVisible();
  await expect(page.getByText("Weaknesses").first()).toBeVisible();
  await expect(page.getByText("Opportunities").first()).toBeVisible();
  await expect(page.getByText("Threats").first()).toBeVisible();
});

test("case 13: arrange selected in grid", async ({ page }) => {
  const caseId = "case-13";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 2);
  const beforeFirst = await getBoardObjectBox(page, 0);
  const beforeSecond = await getBoardObjectBox(page, 1);

  await selectFirstObjectCount(page, 2);
  const result = await sendAiCommand(
    page,
    caseId,
    "Arrange selected objects in a grid with 2 columns gap x 24 y 32",
  );

  assertCommandIntent(result, "arrange-grid");

  const afterFirst = await getBoardObjectBox(page, 0);
  const afterSecond = await getBoardObjectBox(page, 1);
  const firstMovedDistance = Math.hypot(
    afterFirst.x - beforeFirst.x,
    afterFirst.y - beforeFirst.y,
  );
  const secondMovedDistance = Math.hypot(
    afterSecond.x - beforeSecond.x,
    afterSecond.y - beforeSecond.y,
  );
  expect(Math.abs(afterFirst.y - afterSecond.y)).toBeLessThanOrEqual(12);
  expect(Math.abs(afterSecond.x - afterFirst.x)).toBeGreaterThan(180);
  expect(Math.abs(afterSecond.x - afterFirst.x)).toBeLessThan(320);
  expect(firstMovedDistance > 8 || secondMovedDistance > 8).toBe(true);
});

test("case 14: move selected right by delta", async ({ page }) => {
  const caseId = "case-14";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 2);
  await selectFirstObjectCount(page, 2);

  const beforeFirst = await getBoardObjectBox(page, 0);
  const beforeSecond = await getBoardObjectBox(page, 1);

  const result = await sendAiCommand(
    page,
    caseId,
    "Move selected objects right by 120",
  );

  assertCommandIntent(result, "move-selected");

  const afterFirst = await getBoardObjectBox(page, 0);
  const afterSecond = await getBoardObjectBox(page, 1);
  expect(afterFirst.x - beforeFirst.x).toBeGreaterThan(80);
  expect(afterSecond.x - beforeSecond.x).toBeGreaterThan(80);
});

test("case 15: move selected to target position", async ({ page }) => {
  const caseId = "case-15";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 2);
  await selectFirstObjectCount(page, 2);

  const beforeFirst = await getBoardObjectBox(page, 0);

  const result = await sendAiCommand(
    page,
    caseId,
    "Move selected objects to 420, 260",
  );

  assertCommandIntent(result, "move-selected");

  const afterFirst = await getBoardObjectBox(page, 0);
  expect(Math.hypot(afterFirst.x - beforeFirst.x, afterFirst.y - beforeFirst.y)).toBeGreaterThan(
    120,
  );
});

test("case 16: move all stickies down", async ({ page }) => {
  const caseId = "case-16";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 3);

  const beforeFirst = await getBoardObjectBox(page, 0);
  const beforeSecond = await getBoardObjectBox(page, 1);

  const result = await sendAiCommand(
    page,
    caseId,
    "Move all sticky notes down by 90",
  );

  assertCommandIntent(result, "move-all");

  const afterFirst = await getBoardObjectBox(page, 0);
  const afterSecond = await getBoardObjectBox(page, 1);
  expect(afterFirst.y - beforeFirst.y).toBeGreaterThan(55);
  expect(afterSecond.y - beforeSecond.y).toBeGreaterThan(55);
});

test("case 17: resize selected object", async ({ page }) => {
  const caseId = "case-17";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualRectangles(page, 1);
  await selectFirstObjectCount(page, 1);

  const before = await getBoardObjectBox(page, 0);

  const result = await sendAiCommand(page, caseId, "Resize selected to 260 by 180");

  assertCommandIntent(result, "resize-selected");

  const after = await getBoardObjectBox(page, 0);
  expect(after.width - before.width).toBeGreaterThan(15);
  expect(after.height - before.height).toBeGreaterThan(15);
});

test("case 18: change selected color", async ({ page }) => {
  const caseId = "case-18";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 1);
  await selectFirstObjectCount(page, 1);

  const firstObject = getBoardObjects(page).nth(0);
  const beforeColor = await firstObject.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  const result = await sendAiCommand(
    page,
    caseId,
    "Change selected object color to green",
  );

  assertCommandIntent(result, "change-color");

  const afterColor = await firstObject.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  expect(afterColor).not.toBe(beforeColor);
});

test("case 19: update selected sticky text", async ({ page }) => {
  const caseId = "case-19";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 1);
  await selectFirstObjectCount(page, 1);

  const result = await sendAiCommand(
    page,
    caseId,
    "Update selected sticky text to Q2 priorities",
  );

  assertCommandIntent(result, "update-text");
  await expect(getStickyTextAreas(page).first()).toHaveValue(/Q2 priorities/i);
});

test("case 20: delete selected", async ({ page }) => {
  const caseId = "case-20";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 2);
  await selectFirstObjectCount(page, 2);

  const beforeCount = await getBoardObjects(page).count();
  expect(beforeCount).toBeGreaterThanOrEqual(2);

  const result = await sendAiCommand(page, caseId, "Delete selected");

  assertCommandIntent(result, "delete-selected");
  await expect(getBoardObjects(page)).toHaveCount(beforeCount - 2);
});
