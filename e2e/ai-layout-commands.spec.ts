import { expect, test, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

type AiCommandResult = {
  assistantMessage: string;
  traceId: string;
};

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
  };
  const assistantMessage =
    typeof payload.assistantMessage === "string" ? payload.assistantMessage : "";
  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";

  expect(traceId.length).toBeGreaterThan(0);
  return {
    assistantMessage,
    traceId,
  };
}

/**
 * Handles create board and open.
 */
async function createBoardAndOpen(page: Page, boardTitle: string): Promise<void> {
  await page.goto("/e2e/emulator-login");
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

test("AI command creates many colored stickies with trace id", async ({
  page,
}) => {
  const boardTitle = `E2E AI Sticky Batch ${Date.now()}`;
  await createBoardAndOpen(page, boardTitle);

  const createBatchResult = await sendAiCommand(page, "Create 25 red stickies");
  expect(createBatchResult.assistantMessage).toContain("Created 25 sticky notes");

  const stickyNotes = page.locator("article[data-board-object='true'] textarea");
  await expect(stickyNotes).toHaveCount(25);
  await expect(
    stickyNotes.filter({
      hasText: /Sticky 25/i,
    }),
  ).toHaveCount(1);

  // Trace id is printed to make Langfuse lookup easy after local runs.
  console.log("Langfuse trace id (create sticky batch):", createBatchResult.traceId);
});

test("AI layout commands create sticky grids and arrange selected objects with trace ids", async ({
  page,
}) => {
  const boardTitle = `E2E AI Layout ${Date.now()}`;
  await createBoardAndOpen(page, boardTitle);

  const createGridResult = await sendAiCommand(
    page,
    "Create a 2x3 grid of sticky notes for pros and cons",
  );
  expect(createGridResult.assistantMessage).toContain("sticky grid (6 notes)");

  const stickyCount = page.locator("article[data-board-object='true'] textarea");
  await expect(stickyCount).toHaveCount(6);

  const stickyOne = page
    .locator("article[data-board-object='true'] textarea")
    .filter({ hasText: /pros and cons 1/i })
    .locator("xpath=ancestor::article[1]");
  const stickyTwo = page
    .locator("article[data-board-object='true'] textarea")
    .filter({ hasText: /pros and cons 2/i })
    .locator("xpath=ancestor::article[1]");

  const beforeOne = await stickyOne.boundingBox();
  const beforeTwo = await stickyTwo.boundingBox();
  if (!beforeOne || !beforeTwo) {
    throw new Error("Could not read sticky positions before arrangement.");
  }

  await stickyOne.click({ position: { x: 18, y: 10 } });
  await stickyTwo.click({
    modifiers: ["Shift"],
    position: { x: 18, y: 10 },
  });

  await expect(page.getByText(/Selected:\s*2 objects/i)).toBeVisible();

  const arrangeResult = await sendAiCommand(
    page,
    "Arrange selected objects in a grid with 2 columns gap x 24 y 32",
  );
  expect(arrangeResult.assistantMessage).toContain(
    "Arranged 2 selected objects in a grid",
  );

  const afterOne = await stickyOne.boundingBox();
  const afterTwo = await stickyTwo.boundingBox();
  if (!afterOne || !afterTwo) {
    throw new Error("Could not read sticky positions after arrangement.");
  }

  const beforeSpacingX = beforeTwo.x - beforeOne.x;
  const afterSpacingX = afterTwo.x - afterOne.x;
  const afterSpacingY = Math.abs(afterTwo.y - afterOne.y);

  expect(beforeSpacingX).toBeGreaterThan(220);
  expect(Math.abs(afterSpacingX - 204)).toBeLessThanOrEqual(10);
  expect(afterSpacingY).toBeLessThanOrEqual(10);
  expect(afterSpacingX).toBeLessThan(beforeSpacingX);

  // Trace ids are printed to make Langfuse lookup easy after local runs.
  console.log("Langfuse trace id (create sticky grid):", createGridResult.traceId);
  console.log("Langfuse trace id (arrange grid):", arrangeResult.traceId);
});

test("AI layout commands align and distribute selected objects with trace ids", async ({
  page,
}) => {
  const boardTitle = `E2E AI Align Distribute ${Date.now()}`;
  await createBoardAndOpen(page, boardTitle);

  const createOne = await sendAiCommand(
    page,
    "Add a yellow sticky note at 120, 120 that says Align A",
  );
  const createTwo = await sendAiCommand(
    page,
    "Add a yellow sticky note at 460, 210 that says Align B",
  );
  const createThree = await sendAiCommand(
    page,
    "Add a yellow sticky note at 880, 320 that says Align C",
  );

  const stickyA = page
    .locator("article[data-board-object='true'] textarea")
    .filter({ hasText: /Align A/i })
    .locator("xpath=ancestor::article[1]");
  const stickyB = page
    .locator("article[data-board-object='true'] textarea")
    .filter({ hasText: /Align B/i })
    .locator("xpath=ancestor::article[1]");
  const stickyC = page
    .locator("article[data-board-object='true'] textarea")
    .filter({ hasText: /Align C/i })
    .locator("xpath=ancestor::article[1]");

  await stickyA.click({ position: { x: 16, y: 12 } });
  await stickyB.click({ modifiers: ["Shift"], position: { x: 16, y: 12 } });
  await stickyC.click({ modifiers: ["Shift"], position: { x: 16, y: 12 } });
  await expect(page.getByText(/Selected:\s*3 objects/i)).toBeVisible();

  const alignResult = await sendAiCommand(page, "Align selected objects top");
  expect(alignResult.assistantMessage).toContain("Aligned 3 selected objects");

  const alignedA = await stickyA.boundingBox();
  const alignedB = await stickyB.boundingBox();
  const alignedC = await stickyC.boundingBox();
  if (!alignedA || !alignedB || !alignedC) {
    throw new Error("Could not read sticky positions after align command.");
  }

  expect(Math.abs(alignedA.y - alignedB.y)).toBeLessThanOrEqual(10);
  expect(Math.abs(alignedA.y - alignedC.y)).toBeLessThanOrEqual(10);

  await stickyA.click({ position: { x: 16, y: 12 } });
  await stickyB.click({ modifiers: ["Shift"], position: { x: 16, y: 12 } });
  await stickyC.click({ modifiers: ["Shift"], position: { x: 16, y: 12 } });
  await expect(page.getByText(/Selected:\s*3 objects/i)).toBeVisible();

  const distributeResult = await sendAiCommand(
    page,
    "Distribute selected objects horizontally",
  );
  expect(distributeResult.assistantMessage).toContain(
    "Distributed 3 selected objects",
  );

  const distributedA = await stickyA.boundingBox();
  const distributedB = await stickyB.boundingBox();
  const distributedC = await stickyC.boundingBox();
  if (!distributedA || !distributedB || !distributedC) {
    throw new Error("Could not read sticky positions after distribute command.");
  }

  const centerAX = distributedA.x + distributedA.width / 2;
  const centerBX = distributedB.x + distributedB.width / 2;
  const centerCX = distributedC.x + distributedC.width / 2;
  const deltaAB = centerBX - centerAX;
  const deltaBC = centerCX - centerBX;

  expect(Math.abs(deltaAB - deltaBC)).toBeLessThanOrEqual(10);

  console.log("Langfuse trace id (align create A):", createOne.traceId);
  console.log("Langfuse trace id (align create B):", createTwo.traceId);
  console.log("Langfuse trace id (align create C):", createThree.traceId);
  console.log("Langfuse trace id (align selected):", alignResult.traceId);
  console.log(
    "Langfuse trace id (distribute selected):",
    distributeResult.traceId,
  );
});
