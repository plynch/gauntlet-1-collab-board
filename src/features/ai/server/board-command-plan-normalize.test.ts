import { describe, expect, it } from "vitest";

import { applyViewportBoundsToSideMoveOperations } from "@/features/ai/server/board-command-plan-normalize";
import type { TemplatePlan } from "@/features/ai/types";

describe("applyViewportBoundsToSideMoveOperations", () => {
  it("injects request viewportBounds into side-move operations when missing", () => {
    const plan: TemplatePlan = {
      id: "plan-1",
      name: "Move To Side",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: ["obj-1", "obj-2"],
            toViewportSide: {
              side: "right",
            },
          },
        },
      ],
    };

    const normalized = applyViewportBoundsToSideMoveOperations(plan, {
      left: 120,
      top: 80,
      width: 900,
      height: 640,
    });

    expect(normalized.operations[0]?.tool).toBe("moveObjects");
    if (normalized.operations[0]?.tool === "moveObjects") {
      expect(normalized.operations[0].args.toViewportSide?.viewportBounds).toEqual({
        left: 120,
        top: 80,
        width: 900,
        height: 640,
      });
    }
  });

  it("preserves operation viewportBounds when already present", () => {
    const plan: TemplatePlan = {
      id: "plan-2",
      name: "Move To Side",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: ["obj-1"],
            toViewportSide: {
              side: "left",
              viewportBounds: {
                left: 0,
                top: 0,
                width: 600,
                height: 400,
              },
            },
          },
        },
      ],
    };

    const normalized = applyViewportBoundsToSideMoveOperations(plan, {
      left: 120,
      top: 80,
      width: 900,
      height: 640,
    });

    expect(normalized.operations[0]?.tool).toBe("moveObjects");
    if (normalized.operations[0]?.tool === "moveObjects") {
      expect(normalized.operations[0].args.toViewportSide?.viewportBounds).toEqual({
        left: 0,
        top: 0,
        width: 600,
        height: 400,
      });
    }
  });
});
