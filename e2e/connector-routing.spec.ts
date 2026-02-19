import { expect, test } from "@playwright/test";

test("connector re-anchors to avoid overlapping the moved target shape", async ({ page }) => {
  await page.goto("/e2e/connector-routing");

  const toAnchor = page.getByTestId("to-anchor");
  const overlapTarget = page.getByTestId("overlap-target");
  const circle = page.getByTestId("lab-circle");
  const connectorPath = page.getByTestId("lab-connector-path");

  await expect(overlapTarget).toHaveText("false");
  const initialAnchor = (await toAnchor.innerText()).trim();
  const initialPath = await connectorPath.getAttribute("d");
  expect(initialPath).toBeTruthy();

  const box = await circle.boundingBox();
  if (!box) {
    throw new Error("Circle was not rendered.");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 300, box.y + box.height / 2, {
    steps: 24
  });
  await page.mouse.up();

  await expect(overlapTarget).toHaveText("false");
  const finalAnchor = (await toAnchor.innerText()).trim();
  const finalPath = await connectorPath.getAttribute("d");

  expect(finalAnchor.length).toBeGreaterThan(0);
  expect(finalPath).toBeTruthy();
  expect(finalPath).not.toBe(initialPath);
  expect(finalAnchor === initialAnchor && finalPath === initialPath).toBe(false);
});
