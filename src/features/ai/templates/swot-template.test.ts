import { describe, expect, it } from "vitest";

import { SWOT_TEMPLATE_ID } from "@/features/ai/templates/template-types";
import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";

describe("buildSwotTemplatePlan", () => {
  it("creates one 2x2 grid container with section titles and blank notes", () => {
    const plan = buildSwotTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      boardBounds: null,
      selectedObjectIds: [],
      existingObjectCount: 0,
    });

    expect(plan.templateId).toBe(SWOT_TEMPLATE_ID);
    expect(plan.operations).toHaveLength(1);
    expect(
      plan.operations.filter(
        (operation) => operation.tool === "createGridContainer",
      ),
    ).toHaveLength(1);
    const first = plan.operations[0];
    expect(first?.tool).toBe("createGridContainer");
    if (first?.tool === "createGridContainer") {
      expect(first.args.containerTitle).toBe("SWOT Analysis");
      expect(first.args.sectionTitles).toEqual([
        "Strengths",
        "Weaknesses",
        "Opportunities",
        "Threats",
      ]);
      expect(first.args.cellColors).toEqual([
        "#a7f3d0",
        "#fecaca",
        "#a7f3d0",
        "#fecaca",
      ]);
      expect(first.args.sectionNotes).toEqual(["", "", "", ""]);
    }
  });

  it("autoplaces SWOT to the right of existing board content", () => {
    const plan = buildSwotTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      boardBounds: {
        left: 10,
        right: 500,
        top: 40,
        bottom: 400,
        width: 490,
        height: 360,
      },
      selectedObjectIds: [],
      existingObjectCount: 12,
    });

    const firstGridContainer = plan.operations.find(
      (operation) => operation.tool === "createGridContainer",
    );

    expect(firstGridContainer?.tool).toBe("createGridContainer");
    if (firstGridContainer?.tool === "createGridContainer") {
      expect(firstGridContainer.args.x).toBeGreaterThan(500);
      expect(firstGridContainer.args.y).toBe(40);
    }
  });

  it("sizes SWOT to fill most of the visible viewport when provided", () => {
    const plan = buildSwotTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      boardBounds: null,
      viewportBounds: {
        left: 120,
        top: 80,
        width: 1_200,
        height: 700,
      },
      selectedObjectIds: [],
      existingObjectCount: 0,
    });

    const firstGridContainer = plan.operations.find(
      (operation) => operation.tool === "createGridContainer",
    );

    expect(firstGridContainer?.tool).toBe("createGridContainer");
    if (firstGridContainer?.tool === "createGridContainer") {
      expect(firstGridContainer.args.width).toBe(Math.round(1_200 * 0.9));
      expect(firstGridContainer.args.height).toBe(Math.round(700 * 0.9));
      expect(firstGridContainer.args.x).toBe(
        Math.round(120 + (1_200 - firstGridContainer.args.width) / 2),
      );
      expect(firstGridContainer.args.y).toBe(
        Math.round(80 + (700 - firstGridContainer.args.height) / 2),
      );
    }
  });
});
