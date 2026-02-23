import { describe, expect, it } from "vitest";

import { parseMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";

describe("parseMessageIntentHints", () => {
  it("captures over-limit shape create requests", () => {
    const hints = parseMessageIntentHints("create 500 rectangles");

    expect(hints.createRequest).toBe(true);
    expect(hints.requestedCreateCount).toBe(500);
    expect(hints.shapeRequestedCount).toBe(500);
    expect(hints.createLimitExceeded).toBe(true);
  });

  it("captures multi-part sticky create counts", () => {
    const hints = parseMessageIntentHints(
      "Create 5 pink sticky notes and create 5 blue sticky notes",
    );

    expect(hints.stickyCreateRequest).toBe(true);
    expect(hints.requestedCreateCount).toBe(10);
    expect(hints.stickyRequestedCount).toBe(10);
    expect(hints.createLimitExceeded).toBe(false);
  });

  it("captures sticky grid dimensions and layout hints", () => {
    const hints = parseMessageIntentHints(
      "Create a 2x3 grid of sticky notes in 3 columns gap x 24 y 32",
    );

    expect(hints.requestedCreateCount).toBe(6);
    expect(hints.stickyRequestedCount).toBe(6);
    expect(hints.stickyLayoutHints.columns).toBe(3);
    expect(hints.stickyLayoutHints.gapX).toBe(24);
    expect(hints.stickyLayoutHints.gapY).toBe(32);
  });

  it("captures requests for various sticky colors", () => {
    const hints = parseMessageIntentHints(
      "create 20 sticky notes in various colors",
    );

    expect(hints.stickyCreateRequest).toBe(true);
    expect(hints.variousColorsRequested).toBe(true);
  });
});
