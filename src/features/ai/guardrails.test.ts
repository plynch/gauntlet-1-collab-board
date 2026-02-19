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
      expect(result.error).toContain("Grid layout operation");
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
