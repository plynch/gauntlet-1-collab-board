import { expect, test, type Page } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

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

test("sticky text area supports hold-drag and clickable controls use pointer cursor", async ({
  page,
}) => {
  const boardTitle = `E2E Sticky Drag ${Date.now()}`;
  await createBoardAndOpen(page, boardTitle);

  const swotButton = page.getByRole("button", { name: "SWOT" });
  await expect(swotButton).toBeVisible();
  const swotCursor = await swotButton.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(swotCursor).toBe("pointer");

  const addStickyButton = page.locator("button[title='Add sticky']").first();
  await expect(addStickyButton).toBeVisible();
  const addStickyCursor = await addStickyButton.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(addStickyCursor).toBe("pointer");
  await addStickyButton.click();

  const stickyText = page.locator("article[data-board-object='true'] textarea").first();
  await expect(stickyText).toBeVisible();
  const stickyGrabCursor = await stickyText.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(stickyGrabCursor).toBe("grab");

  const stickyArticle = stickyText.locator("xpath=ancestor::article[1]");
  const before = await stickyArticle.boundingBox();
  if (!before) {
    throw new Error("Could not read sticky bounds before drag.");
  }

  const startX = before.x + Math.min(before.width - 12, 28);
  const startY = before.y + Math.min(before.height - 12, 52);

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(170);

  const stickyGrabbingCursor = await stickyText.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(stickyGrabbingCursor).toBe("grabbing");

  await page.mouse.move(startX + 180, startY + 130, { steps: 8 });
  await page.mouse.up();

  const after = await stickyArticle.boundingBox();
  if (!after) {
    throw new Error("Could not read sticky bounds after drag.");
  }

  expect(after.x - before.x).toBeGreaterThan(80);
  expect(after.y - before.y).toBeGreaterThan(60);
  const stickyCursorAfter = await stickyText.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(stickyCursorAfter).toBe("grab");
});
