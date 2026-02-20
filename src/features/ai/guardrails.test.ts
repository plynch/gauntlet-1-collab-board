import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMemoryGuardrailStore } from "@/features/ai/guardrail-store.memory";
import {
  acquireBoardCommandLock,
  checkUserRateLimit,
  releaseBoardCommandLock,
  setGuardrailStoreForTests,
  validateTemplatePlan,
} from "@/features/ai/guardrails";
import { SWOT_TEMPLATE_ID } from "@/features/ai/templates/template-types";

beforeEach(() => {
  setGuardrailStoreForTests(createMemoryGuardrailStore());
});

afterEach(() => {
  setGuardrailStoreForTests(null);
});

describe("validateTemplatePlan", () => {
  it("accepts plan within operation and create limits", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "SWOT",
      operations: [
        {
          tool: "createShape",
          args: {
            type: "rect",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            color: "#dbeafe",
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
  });

  it("accepts creating 25 sticky notes in one command", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Create 25 stickies",
      operations: Array.from({ length: 25 }, (_, index) => ({
        tool: "createStickyNote" as const,
        args: {
          text: `Sticky ${index + 1}`,
          x: index * 10,
          y: 0,
          color: "#fde68a",
        },
      })),
    });

    expect(result.ok).toBe(true);
  });

  it("accepts createStickyBatch when count is within limit", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Create sticky batch",
      operations: [
        {
          tool: "createStickyBatch",
          args: {
            count: 25,
            color: "#fde68a",
            originX: 100,
            originY: 140,
          },
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.objectsCreated).toBe(25);
    }
  });

  it("rejects oversized createStickyBatch calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Create sticky batch",
      operations: [
        {
          tool: "createStickyBatch",
          args: {
            count: 51,
            color: "#fde68a",
            originX: 100,
            originY: 140,
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("createStickyBatch");
    }
  });

  it("rejects oversized deleteObjects calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Clear board",
      operations: [
        {
          tool: "deleteObjects",
          args: {
            objectIds: Array.from(
              { length: 2_001 },
              (_, index) => `obj-${index}`,
            ),
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
    }
  });

  it("rejects oversized arrangeObjectsInGrid calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Arrange grid",
      operations: [
        {
          tool: "arrangeObjectsInGrid",
          args: {
            objectIds: Array.from(
              { length: 51 },
              (_, index) => `obj-${index}`,
            ),
            columns: 3,
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("arrangeObjectsInGrid");
    }
  });

  it("rejects oversized alignObjects calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Align",
      operations: [
        {
          tool: "alignObjects",
          args: {
            objectIds: Array.from(
              { length: 51 },
              (_, index) => `obj-${index}`,
            ),
            alignment: "left",
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("alignObjects");
    }
  });

  it("rejects oversized distributeObjects calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Distribute",
      operations: [
        {
          tool: "distributeObjects",
          args: {
            objectIds: Array.from(
              { length: 51 },
              (_, index) => `obj-${index}`,
            ),
            axis: "horizontal",
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("distributeObjects");
    }
  });

  it("rejects oversized moveObjects calls", () => {
    const result = validateTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      templateName: "Move objects",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: Array.from(
              { length: 501 },
              (_, index) => `obj-${index}`,
            ),
            delta: {
              dx: 120,
              dy: 0,
            },
          },
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain("moveObjects");
    }
  });
});

describe("checkUserRateLimit", () => {
  it("blocks after max calls in the same window", async () => {
    const userId = `test-user-${Date.now()}`;
    const now = Date.now();
    let blockedAt: number | null = null;

    for (let index = 0; index < 25; index += 1) {
      const result = await checkUserRateLimit(userId, now + index);
      if (!result.ok) {
        blockedAt = index;
        break;
      }
    }

    expect(blockedAt).not.toBeNull();
  });
});

describe("acquireBoardCommandLock", () => {
  it("allows only one lock holder per board id", async () => {
    const boardId = `board-${Date.now()}`;
    const first = await acquireBoardCommandLock(boardId);
    const second = await acquireBoardCommandLock(boardId);
    await releaseBoardCommandLock(boardId);
    const third = await acquireBoardCommandLock(boardId);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
    expect(third.ok).toBe(true);
    await releaseBoardCommandLock(boardId);
  });
});
