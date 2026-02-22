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

test("side panels collapse into full-height handles and expand back", async ({
  page,
}) => {
  const boardTitle = `E2E Panel Handles ${Date.now()}`;
  await createBoardAndOpen(page, boardTitle);

  const collapseTools = page.getByRole("button", {
    name: "Collapse tools panel",
  });
  const collapseUsers = page.getByRole("button", {
    name: "Collapse online users panel",
  });

  await expect(collapseTools).toBeVisible();
  await expect(collapseUsers).toBeVisible();

  await collapseTools.click();
  const expandTools = page.getByRole("button", { name: "Expand tools panel" });
  await expect(expandTools).toBeVisible();

  const toolsHandleBox = await expandTools.boundingBox();
  if (!toolsHandleBox) {
    throw new Error("Could not read collapsed tools handle bounds.");
  }
  expect(toolsHandleBox.height).toBeGreaterThan(120);

  await collapseUsers.click();
  const expandUsers = page.getByRole("button", {
    name: "Expand online users panel",
  });
  await expect(expandUsers).toBeVisible();

  const usersHandleBox = await expandUsers.boundingBox();
  if (!usersHandleBox) {
    throw new Error("Could not read collapsed users handle bounds.");
  }
  expect(usersHandleBox.height).toBeGreaterThan(120);

  await expandTools.click();
  await expect(collapseTools).toBeVisible();

  await expandUsers.click();
  await expect(collapseUsers).toBeVisible();
});
