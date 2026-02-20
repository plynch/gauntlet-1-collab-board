import { describe, expect, it } from "vitest";

import { calculateSelectionHudPosition } from "@/features/boards/components/realtime-canvas/selection-hud-layout";

describe("calculateSelectionHudPosition", () => {
  it("places connector HUD away from connector midpoint", () => {
    const position = calculateSelectionHudPosition({
      canShowHud: true,
      selectedObjectBounds: {
        left: 100,
        right: 220,
        top: 100,
        bottom: 160,
      },
      stageSize: {
        width: 1200,
        height: 800,
      },
      viewport: {
        x: 0,
        y: 0,
        scale: 1,
      },
      selectionHudSize: {
        width: 220,
        height: 86,
      },
      selectedConnectorMidpoint: {
        x: 400,
        y: 300,
      },
      preferSidePlacement: false,
    });

    expect(position).not.toBeNull();
    expect(position?.x).toBeGreaterThan(400);
    expect(position?.y).toBeLessThan(300);
  });

  it("keeps non-connector HUD within stage bounds", () => {
    const position = calculateSelectionHudPosition({
      canShowHud: true,
      selectedObjectBounds: {
        left: 0,
        right: 40,
        top: 0,
        bottom: 40,
      },
      stageSize: {
        width: 420,
        height: 300,
      },
      viewport: {
        x: 0,
        y: 0,
        scale: 1,
      },
      selectionHudSize: {
        width: 220,
        height: 86,
      },
      selectedConnectorMidpoint: null,
      preferSidePlacement: false,
    });

    expect(position).not.toBeNull();
    expect(position?.x).toBeGreaterThanOrEqual(10);
    expect(position?.y).toBeGreaterThanOrEqual(10);
    expect((position?.x ?? 0) + 220).toBeLessThanOrEqual(410);
    expect((position?.y ?? 0) + 86).toBeLessThanOrEqual(290);
  });
});
