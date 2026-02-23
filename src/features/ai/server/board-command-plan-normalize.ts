import type { TemplatePlan, ViewportBounds } from "@/features/ai/types";

export function applyViewportBoundsToSideMoveOperations(
  plan: TemplatePlan,
  viewportBounds: ViewportBounds | null | undefined,
): TemplatePlan {
  if (!viewportBounds) {
    return plan;
  }

  let mutated = false;
  const operations = plan.operations.map((operation) => {
    if (operation.tool !== "moveObjects" || !operation.args.toViewportSide) {
      return operation;
    }
    if (operation.args.toViewportSide.viewportBounds) {
      return operation;
    }
    mutated = true;
    return {
      ...operation,
      args: {
        ...operation.args,
        toViewportSide: {
          ...operation.args.toViewportSide,
          viewportBounds,
        },
      },
    };
  });

  if (!mutated) {
    return plan;
  }
  return { ...plan, operations };
}
