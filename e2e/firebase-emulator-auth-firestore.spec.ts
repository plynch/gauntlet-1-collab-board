import { expect, test } from "@playwright/test";

const emulatorMode = process.env.PLAYWRIGHT_EMULATOR_MODE === "1";

test.skip(
  !emulatorMode,
  "Firebase emulator e2e runs only when PLAYWRIGHT_EMULATOR_MODE=1.",
);

test("auth emulator login + firestore board creation + SWOT generation", async ({
  page,
}) => {
  const boardTitle = `E2E Emulator Board ${Date.now()}`;

  await page.goto("/e2e/emulator-login");
  await page.getByTestId("emulator-login-button").click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: /My Boards/ })).toBeVisible();
  await expect(page.getByText(/Signed in as/i)).toBeVisible();

  await page.getByRole("button", { name: "Create New Board" }).click();
  await page.getByPlaceholder("Board title").fill(boardTitle);
  await page.getByRole("button", { name: "Create board" }).click();

  await expect(page.getByText(boardTitle)).toBeVisible();
  await page.getByRole("link", { name: `Open board ${boardTitle}` }).click();

  await expect(page).toHaveURL(/\/boards\//);
  await expect(page.getByRole("button", { name: "SWOT" })).toBeVisible();
  await page.getByRole("button", { name: "SWOT" }).click();

  await expect(page.getByText("SWOT Analysis").first()).toBeVisible();
  await expect(page.getByText("Strengths").first()).toBeVisible();
  await expect(page.getByText("Weaknesses").first()).toBeVisible();
  await expect(page.getByText("Opportunities").first()).toBeVisible();
  await expect(page.getByText("Threats").first()).toBeVisible();
});
