import { describe, expect, it } from "vitest";

import { SWOT_TEMPLATE_ID } from "@/features/ai/templates/template-types";
import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";

describe("buildSwotTemplatePlan", () => {
  it("creates 8 operations with 4 quadrant rectangles and 4 label notes", () => {
    const plan = buildSwotTemplatePlan({
      templateId: SWOT_TEMPLATE_ID,
      boardBounds: null,
      selectedObjectIds: [],
      existingObjectCount: 0
    });

    expect(plan.templateId).toBe(SWOT_TEMPLATE_ID);
    expect(plan.operations).toHaveLength(8);
    expect(plan.operations.filter((operation) => operation.tool === "createShape")).toHaveLength(
      4
    );
    expect(
      plan.operations.filter((operation) => operation.tool === "createStickyNote")
    ).toHaveLength(4);
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
        height: 360
      },
      selectedObjectIds: [],
      existingObjectCount: 12
    });

    const firstQuadrant = plan.operations.find(
      (operation) => operation.tool === "createShape"
    );

    expect(firstQuadrant?.tool).toBe("createShape");
    if (firstQuadrant?.tool === "createShape") {
      expect(firstQuadrant.args.x).toBeGreaterThan(500);
      expect(firstQuadrant.args.y).toBe(40);
    }
  });
});
