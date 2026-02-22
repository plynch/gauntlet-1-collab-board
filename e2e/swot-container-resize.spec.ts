import { expect, test, type Page } from "@playwright/test";

type SectionBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type StickySnapshot = {
  testId: string;
  sectionIndex: number;
  relX: number;
  relY: number;
  centerX: number;
  centerY: number;
};

async function getSectionBounds(
  page: Page,
  sectionIndex: number,
): Promise<SectionBounds> {
  const section = page.getByTestId(`swot-section-${sectionIndex}`);
  const left = Number(await section.getAttribute("data-left"));
  const right = Number(await section.getAttribute("data-right"));
  const top = Number(await section.getAttribute("data-top"));
  const bottom = Number(await section.getAttribute("data-bottom"));
  return { left, right, top, bottom };
}

async function getStickies(page: Page): Promise<StickySnapshot[]> {
  return page.locator('[data-testid^="swot-sticky-"]').evaluateAll((elements) =>
    elements.map((element) => ({
      testId: element.getAttribute("data-testid") ?? "",
      sectionIndex: Number(element.getAttribute("data-section-index") ?? "-1"),
      relX: Number(element.getAttribute("data-rel-x") ?? "0"),
      relY: Number(element.getAttribute("data-rel-y") ?? "0"),
      centerX: Number(element.getAttribute("data-center-x") ?? "0"),
      centerY: Number(element.getAttribute("data-center-y") ?? "0"),
    })),
  );
}

test("new user SWOT flow keeps sticky notes in correct quadrants after container resize", async ({
  page,
}) => {
  await page.goto("/e2e/swot-container-resize");

  await page.getByTestId("sign-in-new-user").click();
  await expect(page.getByTestId("signed-in-user")).toContainText(
    "new.user.e2e@example.com",
  );

  await page.getByTestId("create-swot-button").click();
  await expect(page.getByTestId("swot-container")).toBeVisible();

  await page.getByTestId("add-sticky-section-0").click();
  await page.getByTestId("add-sticky-section-0").click();
  await page.getByTestId("add-sticky-section-1").click();
  await page.getByTestId("add-sticky-section-2").click();
  await page.getByTestId("add-sticky-section-3").click();

  const beforeStickies = await getStickies(page);
  expect(beforeStickies).toHaveLength(5);
  expect(
    beforeStickies.filter((sticky) => sticky.sectionIndex === 0),
  ).toHaveLength(2);
  expect(
    beforeStickies.filter((sticky) => sticky.sectionIndex === 1),
  ).toHaveLength(1);
  expect(
    beforeStickies.filter((sticky) => sticky.sectionIndex === 2),
  ).toHaveLength(1);
  expect(
    beforeStickies.filter((sticky) => sticky.sectionIndex === 3),
  ).toHaveLength(1);

  const widthBefore = Number(
    await page.getByTestId("swot-container").getAttribute("data-width"),
  );
  const heightBefore = Number(
    await page.getByTestId("swot-container").getAttribute("data-height"),
  );

  const handleBox = await page.getByTestId("swot-resize-handle").boundingBox();
  if (!handleBox) {
    throw new Error("SWOT resize handle not found.");
  }

  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x + 240, handleBox.y + 160, { steps: 18 });
  await page.mouse.up();

  const widthAfter = Number(
    await page.getByTestId("swot-container").getAttribute("data-width"),
  );
  const heightAfter = Number(
    await page.getByTestId("swot-container").getAttribute("data-height"),
  );
  expect(widthAfter).toBeGreaterThan(widthBefore + 120);
  expect(heightAfter).toBeGreaterThan(heightBefore + 90);

  const afterStickies = await getStickies(page);
  expect(afterStickies).toHaveLength(beforeStickies.length);

  const movedCount = beforeStickies.reduce((count, beforeSticky) => {
    const afterSticky = afterStickies.find(
      (candidate) => candidate.testId === beforeSticky.testId,
    );
    if (!afterSticky) {
      return count;
    }
    const distance = Math.hypot(
      afterSticky.centerX - beforeSticky.centerX,
      afterSticky.centerY - beforeSticky.centerY,
    );
    return distance > 8 ? count + 1 : count;
  }, 0);
  expect(movedCount).toBeGreaterThanOrEqual(4);

  for (const beforeSticky of beforeStickies) {
    const afterSticky = afterStickies.find(
      (candidate) => candidate.testId === beforeSticky.testId,
    );
    expect(afterSticky).toBeDefined();
    if (!afterSticky) {
      continue;
    }

    expect(afterSticky.sectionIndex).toBe(beforeSticky.sectionIndex);
    expect(Math.abs(afterSticky.relX - beforeSticky.relX)).toBeLessThanOrEqual(
      0.06,
    );
    expect(Math.abs(afterSticky.relY - beforeSticky.relY)).toBeLessThanOrEqual(
      0.06,
    );

    const sectionBounds = await getSectionBounds(
      page,
      afterSticky.sectionIndex,
    );
    expect(afterSticky.centerX).toBeGreaterThanOrEqual(sectionBounds.left);
    expect(afterSticky.centerX).toBeLessThanOrEqual(sectionBounds.right);
    expect(afterSticky.centerY).toBeGreaterThanOrEqual(sectionBounds.top);
    expect(afterSticky.centerY).toBeLessThanOrEqual(sectionBounds.bottom);
  }

  const sectionZeroBefore = beforeStickies
    .filter((sticky) => sticky.sectionIndex === 0)
    .sort((left, right) => left.testId.localeCompare(right.testId));
  const sectionZeroAfter = afterStickies
    .filter((sticky) => sticky.sectionIndex === 0)
    .sort((left, right) => left.testId.localeCompare(right.testId));
  expect(sectionZeroBefore).toHaveLength(2);
  expect(sectionZeroAfter).toHaveLength(2);

  const beforeRelDelta = {
    x: sectionZeroBefore[1].relX - sectionZeroBefore[0].relX,
    y: sectionZeroBefore[1].relY - sectionZeroBefore[0].relY,
  };
  const afterRelDelta = {
    x: sectionZeroAfter[1].relX - sectionZeroAfter[0].relX,
    y: sectionZeroAfter[1].relY - sectionZeroAfter[0].relY,
  };
  expect(Math.abs(beforeRelDelta.x - afterRelDelta.x)).toBeLessThanOrEqual(
    0.06,
  );
  expect(Math.abs(beforeRelDelta.y - afterRelDelta.y)).toBeLessThanOrEqual(
    0.06,
  );
});
