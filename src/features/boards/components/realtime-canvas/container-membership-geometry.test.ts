import { describe, expect, it } from "vitest";

import {
  clampObjectTopLeftToSection,
  getClosestSectionIndex,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";

describe("container-membership-geometry", () => {
  it("produces equal cell sizes for arbitrary NxM grids", () => {
    const sections = getGridSectionBoundsFromGeometry(
      {
        x: 100,
        y: 50,
        width: 420,
        height: 300,
      },
      2,
      3,
      2,
    );

    expect(sections).toHaveLength(6);
    const widths = sections.map((section) => section.right - section.left);
    const heights = sections.map((section) => section.bottom - section.top);
    const firstWidth = widths[0];
    const firstHeight = heights[0];

    widths.forEach((width) => {
      expect(width).toBeCloseTo(firstWidth, 6);
    });
    heights.forEach((height) => {
      expect(height).toBeCloseTo(firstHeight, 6);
    });
  });

  it("keeps section indexing deterministic when dimensions change", () => {
    const point = { x: 460, y: 320 };
    const geometry = { x: 80, y: 60, width: 420, height: 300 };
    const sections2x2 = getGridSectionBoundsFromGeometry(geometry, 2, 2, 2);
    const sections2x3 = getGridSectionBoundsFromGeometry(geometry, 2, 3, 2);
    const sections1x1 = getGridSectionBoundsFromGeometry(geometry, 1, 1, 2);

    expect(getClosestSectionIndex(point, sections2x2)).toBe(3);
    expect(getClosestSectionIndex(point, sections2x3)).toBe(5);
    expect(getClosestSectionIndex(point, sections1x1)).toBe(0);
  });

  it("normalizes relative coordinates into [0, 1]", () => {
    const section = {
      left: 100,
      right: 200,
      top: 50,
      bottom: 150,
    };

    const within = toSectionRelativeCoordinate({ x: 150, y: 100 }, section);
    expect(within).toEqual({ x: 0.5, y: 0.5 });

    const outside = toSectionRelativeCoordinate({ x: 260, y: 20 }, section);
    expect(outside).toEqual({ x: 1, y: 0 });
  });

  it("clamps oversized object positions within a section via centered fallback", () => {
    const section = {
      left: 10,
      right: 60,
      top: 20,
      bottom: 70,
    };
    const oversized = clampObjectTopLeftToSection(
      section,
      { width: 80, height: 70 },
      { x: 200, y: 200 },
    );
    expect(oversized.x).toBeCloseTo(-5, 6);
    expect(oversized.y).toBeCloseTo(10, 6);

    const regular = clampObjectTopLeftToSection(
      section,
      { width: 20, height: 20 },
      { x: 80, y: -10 },
    );
    expect(regular).toEqual({ x: 40, y: 20 });
  });
});
