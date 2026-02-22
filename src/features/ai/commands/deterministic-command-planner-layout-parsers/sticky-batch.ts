import {
  COLOR_KEYWORDS,
  DEFAULT_SIZES,
  MAX_STICKY_BATCH_COUNT,
  STICKY_BATCH_DEFAULT_COLUMNS,
  STICKY_GRID_SPACING_X,
  STICKY_GRID_SPACING_Y,
  STICKY_VIEWPORT_PADDING,
  type Point,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import {
  findColor,
  normalizeMessage,
  parseCoordinatePoint,
  toPositiveInteger,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import { parseSideTarget } from "@/features/ai/commands/deterministic-command-planner-layout-parsers/container-targeting";

export type ParsedStickyBatchClause = {
  sourceText: string;
  count: number;
  color: string;
  textPrefix: string;
  columns: number;
  hasExplicitPoint: boolean;
  point: Point | null;
  side: "left" | "right" | "top" | "bottom" | null;
  rows: number;
  clusterWidth: number;
  clusterHeight: number;
};

export function normalizeFrameTitle(rawTitle: string): string {
  const corrected: Record<string, string> = {
    sprit: "sprint",
    sprits: "sprints",
    plannning: "planning",
    planing: "planning",
  };

  const cleaned = rawTitle
    .replace(/[“”"']/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .trim();

  const normalized = cleaned
    .split(/\s+/)
    .map((word) => corrected[word.toLowerCase()] ?? word)
    .join(" ");

  const shouldTitleCase =
    normalized.length > 0 && normalized === normalized.toLowerCase();
  if (!shouldTitleCase) {
    return normalized;
  }

  return normalized
    .split(/\s+/)
    .map((word, index) => {
      if (word.length === 0) {
        return word;
      }
      if (index === 0 && word.toLowerCase() === "a") {
        return word;
      }
      return word[0]?.toUpperCase() + word.slice(1);
    })
    .join(" ");
}

export function parseStickyText(message: string): string {
  const textMatch = message.match(
    /\b(?:that says|saying|with text|text)\b\s+["“']?(.+?)["”']?$/i,
  );
  if (!textMatch) {
    return "New sticky note";
  }

  const value = textMatch[1].trim();
  return value.length > 0 ? value.slice(0, 1_000) : "New sticky note";
}

export function parseStickyGridTextSeed(message: string): string | null {
  const suffixMatch = message.match(/\bfor\b\s+["“']?(.+?)["”']?$/i);
  if (!suffixMatch) {
    return null;
  }

  const value = suffixMatch[1].trim();
  return value.length > 0 ? value.slice(0, 960) : null;
}

export function parseStickyBatchCount(message: string): number | null {
  const lower = normalizeMessage(message);
  if (
    !/\b(add|create|make|generate)\b/.test(lower) ||
    !/\b(?:stick(?:y|ies)(?:\s+notes?)?|notes?)\b/.test(lower) ||
    /\bgrid\b/.test(lower)
  ) {
    return null;
  }

  const withoutExplicitTextPayload = message
    .replace(/\b(?:that says|saying|with text|text)\b[\s\S]*$/i, "")
    .trim();
  const countMatch = withoutExplicitTextPayload.match(
    /\b(\d+)\s+(?:\w+\s+){0,2}(?:stick(?:y|ies)(?:\s+notes?)?|notes)\b/i,
  );
  if (!countMatch) {
    return null;
  }

  const count = toPositiveInteger(countMatch[1]);
  if (count < 2) {
    return null;
  }

  return count;
}

export function splitStickyCreationClauses(message: string): string[] {
  const commandStartPattern = /\b(?:create|add|make)\b/gi;
  const matches = Array.from(message.matchAll(commandStartPattern), (entry) =>
    entry.index ?? -1,
  ).filter((index) => index >= 0);
  if (matches.length === 0) {
    return [];
  }

  return matches
    .map((startIndex, index) => {
      const endIndex = matches[index + 1] ?? message.length;
      return message.slice(startIndex, endIndex).trim();
    })
    .filter((clause) => clause.length > 0);
}

export function parseStickyBatchClause(
  clause: string,
): ParsedStickyBatchClause | null {
  const count = parseStickyBatchCount(clause);
  if (!count) {
    return null;
  }

  const point = parseCoordinatePoint(clause);
  const columns = Math.min(STICKY_BATCH_DEFAULT_COLUMNS, count);
  const side = parseSideTarget(clause);
  const rows = Math.max(1, Math.ceil(count / columns));
  const stickySize = DEFAULT_SIZES.sticky;
  const clusterWidth = Math.max(
    stickySize.width,
    stickySize.width + (columns - 1) * STICKY_GRID_SPACING_X,
  );
  const clusterHeight = Math.max(
    stickySize.height,
    stickySize.height + (rows - 1) * STICKY_GRID_SPACING_Y,
  );

  return {
    sourceText: clause,
    count,
    color: findColor(clause) ?? COLOR_KEYWORDS.yellow,
    textPrefix: /\b(?:that says|saying|with text|text)\b/i.test(clause)
      ? parseStickyText(clause)
      : "Sticky",
    columns,
    hasExplicitPoint: point !== null,
    point,
    side,
    rows,
    clusterWidth,
    clusterHeight,
  };
}

export function getViewportAnchoredStickyOrigin(options: {
  message: string;
  viewportBounds?: PlannerInput["viewportBounds"];
  count: number;
  columns: number;
}): Point | null {
  const side = parseSideTarget(options.message);
  const viewport = options.viewportBounds;
  if (!side || !viewport) {
    return null;
  }

  const stickySize = DEFAULT_SIZES.sticky;
  const safeCount = Math.max(
    1,
    Math.min(Math.floor(options.count), MAX_STICKY_BATCH_COUNT),
  );
  const safeColumns = Math.max(
    1,
    Math.min(Math.floor(options.columns), safeCount),
  );
  const rows = Math.max(1, Math.ceil(safeCount / safeColumns));
  const clusterWidth = Math.max(
    stickySize.width,
    stickySize.width + (safeColumns - 1) * STICKY_GRID_SPACING_X,
  );
  const clusterHeight = Math.max(
    stickySize.height,
    stickySize.height + (rows - 1) * STICKY_GRID_SPACING_Y,
  );

  const minX = viewport.left + STICKY_VIEWPORT_PADDING;
  const maxX =
    viewport.left + viewport.width - clusterWidth - STICKY_VIEWPORT_PADDING;
  const minY = viewport.top + STICKY_VIEWPORT_PADDING;
  const maxY =
    viewport.top + viewport.height - clusterHeight - STICKY_VIEWPORT_PADDING;
  const fallbackX = viewport.left + (viewport.width - clusterWidth) / 2;
  const fallbackY = viewport.top + (viewport.height - clusterHeight) / 2;

  const clampOrFallback = (value: number, min: number, max: number): number =>
    max < min ? min : Math.min(max, Math.max(min, value));

  let x = fallbackX;
  let y = fallbackY;
  if (side === "left") {
    x = minX;
  } else if (side === "right") {
    x = maxX;
  } else if (side === "top") {
    y = minY;
  } else if (side === "bottom") {
    y = maxY;
  }

  return {
    x: clampOrFallback(x, minX, maxX),
    y: clampOrFallback(y, minY, maxY),
  };
}
