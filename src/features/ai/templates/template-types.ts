import type {
  BoardBounds,
  TemplateInstantiateInput,
  TemplatePlan,
} from "@/features/ai/types";

export const SWOT_TEMPLATE_ID = "swot.v1";
export const SWOT_TEMPLATE_NAME = "SWOT Analysis";

export type TemplateDefinition = {
  id: string;
  name: string;
  instantiate: (input: TemplateInstantiateInput) => TemplatePlan;
};

/**
 * Handles clamp to finite.
 */
export function clampToFinite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Handles normalize bounds.
 */
export function normalizeBounds(
  bounds: BoardBounds | null,
): BoardBounds | null {
  if (!bounds) {
    return null;
  }

  const left = clampToFinite(bounds.left, 0);
  const right = clampToFinite(bounds.right, left);
  const top = clampToFinite(bounds.top, 0);
  const bottom = clampToFinite(bounds.bottom, top);

  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, clampToFinite(bounds.width, right - left)),
    height: Math.max(0, clampToFinite(bounds.height, bottom - top)),
  };
}
