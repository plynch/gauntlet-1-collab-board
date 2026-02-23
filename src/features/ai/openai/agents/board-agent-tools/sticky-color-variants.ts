import type { OpenAiMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";

const STICKY_VARIANT_COLORS = [
  "#fde68a",
  "#fdba74",
  "#fca5a5",
  "#f9a8d4",
  "#c4b5fd",
  "#93c5fd",
  "#99f6e4",
  "#86efac",
  "#d1d5db",
  "#d2b48c",
] as const;

export type StickyColorVariantBatch = {
  count: number;
  color: string;
  originX: number;
  originY: number;
};

export function shouldUseStickyColorVariants(
  hints: OpenAiMessageIntentHints | undefined,
  explicitColor: string | null,
): boolean {
  return Boolean(
    hints?.variousColorsRequested &&
      !hints?.stickyColorHint &&
      (!explicitColor || explicitColor.trim().length === 0),
  );
}

export function buildStickyColorVariantBatches(options: {
  count: number;
  originX: number;
  originY: number;
  columns: number;
  gapX: number;
  gapY: number;
}): StickyColorVariantBatch[] {
  const groups = Math.max(
    1,
    Math.min(options.count, STICKY_VARIANT_COLORS.length),
  );
  const baseCount = Math.floor(options.count / groups);
  const remainder = options.count % groups;
  let consumed = 0;

  return Array.from({ length: groups }, (_, index) => {
    const count = baseCount + (index < remainder ? 1 : 0);
    const startRow = Math.floor(consumed / options.columns);
    const startCol = consumed % options.columns;
    consumed += count;
    return {
      count,
      color: STICKY_VARIANT_COLORS[index % STICKY_VARIANT_COLORS.length],
      originX: options.originX + startCol * options.gapX,
      originY: options.originY + startRow * options.gapY,
    };
  }).filter((batch) => batch.count > 0);
}
