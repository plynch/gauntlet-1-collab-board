import { expect, test, type Locator, type Page } from "@playwright/test";

type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function parsePosition(text: string): { x: number; y: number } {
  const [xText, yText] = text.split(",");
  return {
    x: Number(xText),
    y: Number(yText),
  };
}

async function getSectionBounds(page: Page, index: number): Promise<Bounds> {
  const section = page.getByTestId(`lab-section-${index}`);
  const left = Number(await section.getAttribute("data-left"));
  const right = Number(await section.getAttribute("data-right"));
  const top = Number(await section.getAttribute("data-top"));
  const bottom = Number(await section.getAttribute("data-bottom"));
  return { left, right, top, bottom };
}

async function dragObjectToPoint(
  page: Page,
  object: Locator,
  point: { x: number; y: number },
) {
  const objectBox = await object.boundingBox();
  if (!objectBox) {
    throw new Error("Object was not rendered.");
  }

  await page.mouse.move(
    objectBox.x + objectBox.width / 2,
    objectBox.y + objectBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 20 });
  await page.mouse.up();
}

test("container membership remains stable across dimension changes", async ({
  page,
}) => {
  await page.goto("/e2e/container-membership");

  await expect(page.getByTestId("active-rows")).toHaveText("2");
  await expect(page.getByTestId("active-cols")).toHaveText("2");

  const section3Before = await getSectionBounds(page, 3);
  const object = page.getByTestId("lab-object");
  const stage = page.locator("section").first();
  const stageBox = await stage.boundingBox();
  if (!stageBox) {
    throw new Error("Stage was not rendered.");
  }

  await dragObjectToPoint(page, object, {
    x: stageBox.x + (section3Before.left + section3Before.right) / 2,
    y: stageBox.y + (section3Before.top + section3Before.bottom) / 2,
  });
  await expect(page.getByTestId("assigned-section")).toHaveText("3");

  await page.getByTestId("col-select").selectOption("3");
  await expect(page.getByTestId("active-cols")).toHaveText("3");
  await expect(page.getByTestId("assigned-section")).toHaveText("3");

  const section3After = await getSectionBounds(page, 3);
  const objectPosition = parsePosition(
    await page.getByTestId("object-position").innerText(),
  );
  const objectCenter = {
    x: objectPosition.x + 54,
    y: objectPosition.y + 36,
  };
  expect(objectCenter.x).toBeGreaterThanOrEqual(section3After.left);
  expect(objectCenter.x).toBeLessThanOrEqual(section3After.right);
  expect(objectCenter.y).toBeGreaterThanOrEqual(section3After.top);
  expect(objectCenter.y).toBeLessThanOrEqual(section3After.bottom);

  await page.getByTestId("row-select").selectOption("1");
  await page.getByTestId("col-select").selectOption("1");
  await expect(page.getByTestId("active-rows")).toHaveText("1");
  await expect(page.getByTestId("active-cols")).toHaveText("1");
  await expect(page.getByTestId("assigned-section")).toHaveText("0");

  const containerBox = await page.getByTestId("lab-container").boundingBox();
  const finalObjectBox = await object.boundingBox();
  if (!containerBox || !finalObjectBox) {
    throw new Error("Container or object was not rendered.");
  }

  expect(finalObjectBox.x).toBeGreaterThanOrEqual(containerBox.x - 0.5);
  expect(finalObjectBox.y).toBeGreaterThanOrEqual(containerBox.y - 0.5);
  expect(finalObjectBox.x + finalObjectBox.width).toBeLessThanOrEqual(
    containerBox.x + containerBox.width + 0.5,
  );
  expect(finalObjectBox.y + finalObjectBox.height).toBeLessThanOrEqual(
    containerBox.y + containerBox.height + 0.5,
  );

  await expect(
    page.locator('[data-testid="lab-section-sticky-note"]'),
  ).toHaveCount(0);
});
