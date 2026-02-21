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
const REQUIRED_TRACE_COUNT = 12;
const EXPECTED_OPENAI_MODEL = "gpt-4.1-nano";
const runSeed = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;

type UserIdentity = {
  uid: string;
  email: string;
};

type ObjectSnapshot = {
  backgroundColor: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type AiCommandResult = {
  assistantMessage: string;
  traceId: string;
  provider: "openai" | "deterministic" | "stub" | "unknown";
  mode: "llm" | "deterministic" | "clear" | "replace" | "unknown";
  openAiStatus: string;
  openAiModel: string;
};

type PaletteHint = "yellow" | "blue" | "pink";

const PALETTE_HINTS: Record<PaletteHint, readonly string[]> = {
  yellow: ["rgb(253,230,138)", "rgba(253,230,138,"],
  blue: ["rgb(147,197,253)", "rgba(147,197,253,"],
  pink: ["rgb(249,168,212)", "rgba(249,168,212,"],
};

function normalizeColorValue(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function colorMatches(value: string, target: PaletteHint): boolean {
  const normalized = normalizeColorValue(value);
  return PALETTE_HINTS[target].some((needle) => normalized.startsWith(needle));
}

function countColor(objects: readonly ObjectSnapshot[], target: PaletteHint): number {
  return objects.filter((object) => colorMatches(object.backgroundColor, target)).length;
}

function sanitizeUserKey(value: string): string {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 50);

  return sanitized.length > 0 ? sanitized : "e2e-user";
}

function createUserIdentity(caseId: string): UserIdentity {
  const uid = sanitizeUserKey(`e2e-required-${caseId}-${runSeed}`);
  return {
    uid,
    email: `${uid}@e2e.local`,
  };
}

function getBoardObjects(page: Page): Locator {
  return page.locator("article[data-board-object='true']");
}

function getStickyTextAreas(page: Page): Locator {
  return page.locator("article[data-board-object='true'] textarea");
}

function getBoardObjectBox(page: Page, index: number) {
  return getBoardObjects(page).nth(index).boundingBox();
}

async function readBoardObjectSnapshots(page: Page): Promise<ObjectSnapshot[]> {
  const objects = getBoardObjects(page);
  const count = await objects.count();
  const snapshots: ObjectSnapshot[] = [];

  for (let index = 0; index < count; index += 1) {
    const object = objects.nth(index);
    const snapshot = await object.evaluate((element): ObjectSnapshot => {
      const style = getComputedStyle(element as HTMLElement);
      const box = element.getBoundingClientRect();
      const textarea = element.querySelector("textarea") as HTMLTextAreaElement | null;
      return {
        backgroundColor: style.backgroundColor ?? "",
        text: textarea ? textarea.value : "",
        x: Math.round(box.x),
        y: Math.round(box.y),
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    });

    snapshots.push(snapshot);
  }

  return snapshots;
}

async function createBoardAndOpen(
  page: Page,
  caseId: string,
  boardTitle: string,
): Promise<void> {
  const identity = createUserIdentity(caseId);
  const loginUrl = `/e2e/emulator-login?uid=${encodeURIComponent(identity.uid)}&email=${encodeURIComponent(identity.email)}`;
  await page.goto(loginUrl);

  let signedIn = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const tokenResponsePromise = page
      .waitForResponse(
        (response) =>
          response.url().includes("/api/e2e/custom-token") &&
          response.request().method() === "POST",
        { timeout: 5_000 },
      )
      .catch(() => null);

    await page.getByTestId("emulator-login-button").click();
    await tokenResponsePromise;

    const landed = await page
      .waitForURL(/\/$/, { timeout: 5_000 })
      .then(() => true)
      .catch(() => false);
    if (landed) {
      signedIn = true;
      break;
    }

    if (attempt < 2) {
      await page.waitForTimeout(350);
    }
  }

  if (!signedIn) {
    throw new Error(`Emulator login did not complete for ${identity.uid}.`);
  }

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
        { timeout: 4_000 },
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

async function sendAiCommand(
  page: Page,
  commandId: string,
  message: string,
  trackAsRequired = true,
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
  const payload = (await response.json()) as {
    error?: unknown;
    traceId?: unknown;
    provider?: unknown;
    mode?: unknown;
    assistantMessage?: unknown;
    execution?: {
      openAi?: {
        status?: unknown;
        model?: unknown;
      };
    };
  };

  if (!response.ok()) {
    const errorMessage =
      typeof payload.error === "string" && payload.error.length > 0
        ? payload.error
        : `HTTP ${response.status()}`;
    throw new Error(
      `Required command failed for ${commandId} (${response.status()}): ${errorMessage}`,
    );
  }

  const assistantMessage =
    typeof payload.assistantMessage === "string" ? payload.assistantMessage : "";
  const traceId = typeof payload.traceId === "string" ? payload.traceId : "";
  const provider =
    payload.provider === "openai" || payload.provider === "deterministic" || payload.provider === "stub"
      ? payload.provider
      : "unknown";
  const mode =
    payload.mode === "llm" ||
    payload.mode === "deterministic" ||
    payload.mode === "clear" ||
    payload.mode === "replace"
      ? payload.mode
      : "unknown";
  const openAiStatus =
    typeof payload.execution?.openAi?.status === "string"
      ? payload.execution.openAi.status
      : "";
  const openAiModel =
    typeof payload.execution?.openAi?.model === "string"
      ? payload.execution.openAi.model
      : "";

  expect(traceId.length).toBeGreaterThan(0);
  expect(["openai", "deterministic", "stub", "unknown"]).toContain(provider);
  if (provider === "openai") {
    expect(mode).toBe("llm");
    expect(openAiStatus).toBe("planned");
    expect(openAiModel).toBe(EXPECTED_OPENAI_MODEL);
  } else if (provider === "deterministic" || provider === "stub") {
    expect(mode).toBe("deterministic");
  }

  if (trackAsRequired) {
    requiredTraceIds.push(traceId);
    console.log(
      `[langfuse-trace] required=${commandId} traceId=${traceId} dashboard=${LANGFUSE_DASHBOARD_URL}`,
    );
  }

  return {
    assistantMessage,
    traceId,
    provider,
    mode,
    openAiStatus,
    openAiModel,
  };
}

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

async function addManualStickyNotes(page: Page, count: number): Promise<void> {
  const objects = getBoardObjects(page);
  const initialCount = await objects.count();

  for (let index = 0; index < count; index += 1) {
    await page.locator("button[title='Add sticky']").first().click();
    await expect(objects).toHaveCount(initialCount + index + 1);
  }
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
      `Langfuse is not configured server-side (baseUrl=${String(langfusePayload.baseUrl ?? "(unset)")} ).`,
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
        "Set OPENAI_API_KEY and AI_ENABLE_OPENAI=true, then rerun with a paid command suite.",
      ].join("\n"),
    );
  }

  expect(openAiPayload.model).toBe(EXPECTED_OPENAI_MODEL);
  expect(openAiPayload.plannerMode).toBe("openai-strict");
  expect(openAiPayload.runtime).toBe("agents-sdk");
});

test.afterAll(() => {
  expect(requiredTraceIds).toHaveLength(REQUIRED_TRACE_COUNT);
  expect(new Set(requiredTraceIds).size).toBe(REQUIRED_TRACE_COUNT);
});

test("golden: case-01 add yellow sticky note with text", async ({ page }) => {
  const caseId = "golden-01";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "yellow-sticky",
    "Add a yellow sticky note that says 'User Research'",
  );

  const sticky = getStickyTextAreas(page).first();
  await expect(sticky).toHaveValue(/User Research/i);

  const objects = await readBoardObjectSnapshots(page);
  expect(countColor(objects, "yellow")).toBeGreaterThanOrEqual(1);
});

test("golden: case-02 create blue rectangle at 100,200", async ({ page }) => {
  const caseId = "golden-02";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "blue-rectangle",
    "Create a blue rectangle at position 100, 200",
  );

  const rectangle = await getBoardObjectBox(page, 0);
  if (!rectangle) {
    throw new Error("Expected one canvas object for rectangle test.");
  }

  expect(Math.abs(Math.round(rectangle.x) - 100)).toBeLessThanOrEqual(16);
  expect(Math.abs(Math.round(rectangle.y) - 200)).toBeLessThanOrEqual(16);
});

test("golden: case-03 add frame called Sprint Planning", async ({ page }) => {
  const caseId = "golden-03";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "sprint-planning-frame",
    "Add a frame called Sprint Planning",
  );

  await expect(page.getByText("Sprint Planning").first()).toBeVisible();
});

test("golden: case-04 create 5 pink sticky notes", async ({ page }) => {
  const caseId = "golden-04";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(page, "pink-sticky-batch", "Create 5 pink sticky notes");
  const objects = await readBoardObjectSnapshots(page);
  expect(countColor(objects, "pink")).toBe(5);
});

test("golden: case-05 create 5 blue sticky notes", async ({ page }) => {
  const caseId = "golden-05";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(page, "blue-sticky-batch", "Create 5 blue sticky notes");
  const objects = await readBoardObjectSnapshots(page);
  expect(countColor(objects, "blue")).toBe(5);
});

test("golden: case-06 move all pink sticky notes to the right side", async ({ page }) => {
  const caseId = "golden-06";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(page, "setup-pink", "Create 5 pink sticky notes", false);
  await sendAiCommand(page, "setup-blue", "Create 5 blue sticky notes", false);

  const before = await readBoardObjectSnapshots(page);
  const pinkIndexes = before
    .map((object, index) => (colorMatches(object.backgroundColor, "pink") ? index : -1))
    .filter((index) => index >= 0);
  const nonPinkIndexes = before
    .map((object, index) => (!colorMatches(object.backgroundColor, "pink") ? index : -1))
    .filter((index) => index >= 0);

  expect(pinkIndexes).toHaveLength(5);
  expect(nonPinkIndexes).toHaveLength(5);

  await sendAiCommand(page, "move-pink-right", "Move all the pink sticky notes to the right side");

  const after = await readBoardObjectSnapshots(page);
  for (const index of pinkIndexes) {
    expect(after[index].x).toBeGreaterThan(before[index].x + 50);
  }

  for (const index of nonPinkIndexes) {
    expect(Math.abs(after[index].x - before[index].x)).toBeLessThanOrEqual(120);
  }
});

test("golden: case-07 arrange these sticky notes in a grid", async ({ page }) => {
  const caseId = "golden-07";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 4);
  await selectFirstObjectCount(page, 4);

  const before = await readBoardObjectSnapshots(page);
  const movedCase = await sendAiCommand(
    page,
    "arrange-grid",
    "Arrange these sticky notes in a grid",
  );
  expect(movedCase.assistantMessage.length).toBeGreaterThan(0);
  const after = await readBoardObjectSnapshots(page);

  expect(before).toHaveLength(4);
  expect(after).toHaveLength(4);

  const movedCount = after.filter(
    (object, index) =>
      Math.abs(object.x - before[index].x) > 2 ||
      Math.abs(object.y - before[index].y) > 2,
  ).length;
  expect(movedCount).toBeGreaterThanOrEqual(2);

  const uniqueX = new Set(after.map((object) => object.x));
  const uniqueY = new Set(after.map((object) => object.y));
  expect(uniqueX.size).toBeGreaterThanOrEqual(2);
  expect(uniqueY.size).toBeGreaterThanOrEqual(2);
});

test("golden: case-08 create 2x3 grid of sticky notes for pros and cons", async ({ page }) => {
  const caseId = "golden-08";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "sticky-grid",
    "Create a 2x3 grid of sticky notes for pros and cons",
  );

  const stickyCount = await getStickyTextAreas(page).count();
  expect(stickyCount).toBe(6);
});

test("golden: case-09 space these elements evenly", async ({ page }) => {
  const caseId = "golden-09";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await addManualStickyNotes(page, 4);
  await selectFirstObjectCount(page, 4);

  const before = await readBoardObjectSnapshots(page);
  const beforeXSpan = Math.max(...before.map((object) => object.x)) - Math.min(...before.map((object) => object.x));
  const beforeYSpan = Math.max(...before.map((object) => object.y)) - Math.min(...before.map((object) => object.y));

  await sendAiCommand(page, "space-evenly", "Space these elements evenly");

  const after = await readBoardObjectSnapshots(page);
  const afterXSpan = Math.max(...after.map((object) => object.x)) - Math.min(...after.map((object) => object.x));
  const afterYSpan = Math.max(...after.map((object) => object.y)) - Math.min(...after.map((object) => object.y));
  const beforeMaxSpan = Math.max(beforeXSpan, beforeYSpan);
  const afterMaxSpan = Math.max(afterXSpan, afterYSpan);

  expect(after).toHaveLength(4);
  expect(afterMaxSpan).toBeGreaterThan(beforeMaxSpan + 20);
});

test("golden: case-10 create SWOT template", async ({ page }) => {
  const caseId = "golden-10";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "swot-template",
    "Create a SWOT analysis template with four quadrants",
  );

  await expect(page.getByText("SWOT Analysis").first()).toBeVisible();
  await expect(page.getByText("Strengths").first()).toBeVisible();
  await expect(page.getByText("Weaknesses").first()).toBeVisible();
  await expect(page.getByText("Opportunities").first()).toBeVisible();
  await expect(page.getByText("Threats").first()).toBeVisible();
});

test("golden: case-11 build a user journey map with 5 stages", async ({ page }) => {
  const caseId = "golden-11";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(page, "journey-map", "Build a user journey map with 5 stages");

  await expect(page.getByText("User Journey Map (5 stages)").first()).toBeVisible();
  await expect(getStickyTextAreas(page)).toHaveCount(5);
  await expect(page.getByText("1. Discover")).toBeVisible();
  await expect(page.getByText("2. Consider")).toBeVisible();
});

test("golden: case-12 create retrospective board", async ({ page }) => {
  const caseId = "golden-12";
  const boardTitle = `E2E ${caseId} ${Date.now()}`;
  await createBoardAndOpen(page, caseId, boardTitle);

  await sendAiCommand(
    page,
    "retrospective-board",
    "Set up a retrospective board with What Went Well, What Didn't, and Action Items columns",
  );

  await expect(page.getByText("Retrospective Board")).toBeVisible();
  await expect(page.getByText("What Went Well")).toBeVisible();
  await expect(page.getByText("What Didn't")).toBeVisible();
  await expect(page.getByText("Action Items")).toBeVisible();
});
