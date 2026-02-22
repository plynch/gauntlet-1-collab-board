import type { CoordinateHints } from "@/features/ai/commands/coordinate-hints";
import type { OpenAiMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";
import type { ViewportBounds } from "@/features/ai/types";
import {
  DEFAULT_BATCH_COLUMNS,
  STICKY_HEIGHT,
  STICKY_MIN_STEP_X,
  STICKY_MIN_STEP_Y,
  STICKY_WIDTH,
  toBoundedInt,
  toFiniteNumber,
} from "@/features/ai/openai/agents/board-agent-tools/shared";

type StickyBatchLayoutOptions = {
  count: number;
  args: {
    originX: number | null;
    originY: number | null;
    columns: number | null;
    gapX: number | null;
    gapY: number | null;
  };
  viewportBounds: ViewportBounds | null;
  defaultPoint: { x: number; y: number };
  explicitCoordinateHints: CoordinateHints | null;
  messageIntentHints?: OpenAiMessageIntentHints;
};

export function resolveStickyBatchLayout(options: StickyBatchLayoutOptions): {
  originX: number;
  originY: number;
  columns: number;
  gapX: number;
  gapY: number;
  layoutMode: "user-hint" | "viewport-fit";
} {
  const stickyLayoutHints = options.messageIntentHints?.stickyLayoutHints;
  const hasUserLayoutHints =
    Boolean(stickyLayoutHints?.rowRequested) ||
    Boolean(stickyLayoutHints?.stackRequested) ||
    typeof stickyLayoutHints?.columns === "number" ||
    typeof stickyLayoutHints?.gapX === "number" ||
    typeof stickyLayoutHints?.gapY === "number";
  const layoutMode: "user-hint" | "viewport-fit" = hasUserLayoutHints
    ? "user-hint"
    : "viewport-fit";
  const count = toBoundedInt(options.count, 1, 1, 50);
  let resolvedColumns: number;
  if (stickyLayoutHints?.stackRequested) {
    resolvedColumns = 1;
  } else if (stickyLayoutHints?.rowRequested) {
    resolvedColumns = count;
  } else if (typeof stickyLayoutHints?.columns === "number") {
    resolvedColumns = stickyLayoutHints.columns;
  } else if (typeof options.args.columns === "number") {
    resolvedColumns = options.args.columns;
  } else if (options.viewportBounds && count > 1) {
    const maxColumnsByViewport = Math.max(
      1,
      Math.floor(
        (options.viewportBounds.width + (STICKY_MIN_STEP_X - STICKY_WIDTH)) /
          STICKY_MIN_STEP_X,
      ),
    );
    resolvedColumns = Math.min(count, maxColumnsByViewport);
  } else {
    resolvedColumns = Math.min(count, DEFAULT_BATCH_COLUMNS);
  }
  const columns = toBoundedInt(resolvedColumns, DEFAULT_BATCH_COLUMNS, 1, 10);
  const hintedGapX = toFiniteNumber(stickyLayoutHints?.gapX);
  const hintedGapY = toFiniteNumber(stickyLayoutHints?.gapY);
  const argsGapX = toFiniteNumber(options.args.gapX);
  const argsGapY = toFiniteNumber(options.args.gapY);
  const gapX = toBoundedInt(
    typeof hintedGapX === "number"
      ? STICKY_WIDTH + hintedGapX
      : argsGapX ?? STICKY_MIN_STEP_X,
    STICKY_MIN_STEP_X,
    STICKY_WIDTH,
    400,
  );
  const gapY = toBoundedInt(
    typeof hintedGapY === "number"
      ? STICKY_HEIGHT + hintedGapY
      : argsGapY ?? STICKY_MIN_STEP_Y,
    STICKY_MIN_STEP_Y,
    STICKY_HEIGHT,
    400,
  );
  const shouldUseViewportOrigin =
    layoutMode === "viewport-fit" &&
    !options.explicitCoordinateHints &&
    typeof options.args.originX !== "number" &&
    typeof options.args.originY !== "number";
  const originX = toBoundedInt(
    options.explicitCoordinateHints?.hintedX ??
      options.args.originX ??
      (shouldUseViewportOrigin && options.viewportBounds
        ? options.viewportBounds.left + 40
        : options.defaultPoint.x),
    options.defaultPoint.x,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  const originY = toBoundedInt(
    options.explicitCoordinateHints?.hintedY ??
      options.args.originY ??
      (shouldUseViewportOrigin && options.viewportBounds
        ? options.viewportBounds.top + 40
        : options.defaultPoint.y),
    options.defaultPoint.y,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
  );
  return { originX, originY, columns, gapX, gapY, layoutMode };
}
