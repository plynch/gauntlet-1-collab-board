import type { BoardObjectSnapshot } from "@/features/ai/types";
import {
  COLOR_KEYWORDS,
  DEFAULT_SIZES,
  MAX_STICKY_BATCH_COUNT,
  STICKY_BATCH_DEFAULT_COLUMNS,
  STICKY_BATCH_TOOL_SIZE,
  STICKY_FRAME_PADDING,
  STICKY_GRID_SPACING_X,
  STICKY_GRID_SPACING_Y,
  STICKY_VIEWPORT_PADDING,
  type Point,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import {
  escapeRegex,
  findColor,
  getIntersectionBounds,
  getSelectedObjects,
  normalizeMessage,
  parseCoordinatePoint,
  toPositiveInteger,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";

export type FrameTarget = {
  id: string;
  object: BoardObjectSnapshot;
  reason: "selected" | "visible" | "single-frame";
};

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

export function parseGridGap(message: string): {
  gapX?: number;
  gapY?: number;
} | null {
  const explicitGapMatch = message.match(
    /\bgap\s*x\s*(-?\d+(?:\.\d+)?)\s*y\s*(-?\d+(?:\.\d+)?)\b/i,
  );
  if (explicitGapMatch) {
    return {
      gapX: Number(explicitGapMatch[1]),
      gapY: Number(explicitGapMatch[2]),
    };
  }

  const gapXMatch = message.match(/\bgap\s*x\s*(-?\d+(?:\.\d+)?)\b/i);
  const gapYMatch = message.match(/\bgap\s*y\s*(-?\d+(?:\.\d+)?)\b/i);
  if (gapXMatch || gapYMatch) {
    return {
      gapX: gapXMatch ? Number(gapXMatch[1]) : undefined,
      gapY: gapYMatch ? Number(gapYMatch[1]) : undefined,
    };
  }

  const uniformGapMatch = message.match(/\bgap\s*(-?\d+(?:\.\d+)?)\b/i);
  if (!uniformGapMatch) {
    return null;
  }

  const value = Number(uniformGapMatch[1]);
  return {
    gapX: value,
    gapY: value,
  };
}

export function parseAlignmentMode(message: string):
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom"
  | null {
  const lower = normalizeMessage(message);
  if (/\bleft\b/.test(lower)) {
    return "left";
  }
  if (/\bright\b/.test(lower)) {
    return "right";
  }
  if (/\btop\b/.test(lower)) {
    return "top";
  }
  if (/\bbottom\b/.test(lower)) {
    return "bottom";
  }
  if (/\bmiddle\b/.test(lower)) {
    return "middle";
  }
  if (/\bcenter\b|\bcentre\b/.test(lower)) {
    return "center";
  }

  return null;
}

export function isAddToContainerCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  if (!/\b(add|create|make|generate)\b/.test(lower)) {
    return false;
  }
  if (!/\bsticky(?:\s+note)?s?\b/.test(lower)) {
    return false;
  }
  return (
    /\b(?:to|into|inside|within|in)\b[\w\s]{0,6}\b(frame|container)\b/.test(
      lower,
    ) ||
    /\b(frame|container)\b[\w\s]{0,6}\b(?:to|into|inside|within|in)\b/.test(
      lower,
    )
  );
}

function isContainerObject(objectItem: BoardObjectSnapshot): boolean {
  if (objectItem.type === "gridContainer") {
    return true;
  }

  if (objectItem.type !== "rect") {
    return false;
  }

  return (
    objectItem.gridRows !== undefined ||
    objectItem.gridCols !== undefined ||
    Boolean(objectItem.containerTitle)
  );
}

function getContainerObjects(
  boardState: BoardObjectSnapshot[],
): BoardObjectSnapshot[] {
  return boardState.filter(isContainerObject);
}

function getSelectedContainerObjects(
  boardState: BoardObjectSnapshot[],
  selectedObjectIds: string[],
): BoardObjectSnapshot[] {
  const selectedObjects = getSelectedObjects(boardState, selectedObjectIds);
  return selectedObjects.filter(isContainerObject);
}

export function resolveContainerTarget(input: PlannerInput): FrameTarget | null {
  const selectedFrames = getSelectedContainerObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedFrames.length > 0) {
    return {
      id: selectedFrames[0].id,
      object: selectedFrames[0],
      reason: "selected",
    };
  }

  const containers = getContainerObjects(input.boardState);
  if (input.viewportBounds) {
    const visibleFrames = containers.filter((objectItem) =>
      getIntersectionBounds(objectItem, input.viewportBounds!),
    );
    if (visibleFrames.length === 1) {
      return {
        id: visibleFrames[0].id,
        object: visibleFrames[0],
        reason: "visible",
      };
    }
  }

  if (containers.length === 1) {
    return {
      id: containers[0].id,
      object: containers[0],
      reason: "single-frame",
    };
  }

  return null;
}

export function parseSideTarget(
  message: string,
): "left" | "right" | "top" | "bottom" | null {
  const lower = normalizeMessage(message);
  const sideMatch = lower.match(
    /\b(right|left|top|bottom)\s+(?:side|edge)\b|\b(?:on|to)\s+the\s+(right|left|top|bottom)\b/,
  );
  if (!sideMatch) {
    return null;
  }

  const direction = sideMatch[1] ?? sideMatch[2];
  if (
    direction !== "left" &&
    direction !== "right" &&
    direction !== "top" &&
    direction !== "bottom"
  ) {
    return null;
  }

  return direction;
}

export function resolveContainerStickyOrigin(
  container: BoardObjectSnapshot,
  message: string,
  batchSize: {
    count: number;
    columns: number;
    gapX: number;
    gapY: number;
  },
): Point {
  const width = Math.max(
    1,
    container.width - STICKY_FRAME_PADDING * 2 - STICKY_BATCH_TOOL_SIZE.width,
  );
  const desiredColumns = Math.max(1, Math.min(batchSize.columns, batchSize.count));
  let columns = desiredColumns;
  while (columns > 1) {
    const clusterWidth =
      STICKY_BATCH_TOOL_SIZE.width +
      (columns - 1) * Math.max(batchSize.gapX, 1);
    if (clusterWidth <= width) {
      break;
    }
    columns -= 1;
  }

  const safeColumns = Math.max(1, columns);
  const fallbackX = container.x + STICKY_FRAME_PADDING;
  const fallbackY = container.y + STICKY_FRAME_PADDING;
  const side = parseSideTarget(message);
  if (!side) {
    return {
      x: fallbackX,
      y: fallbackY,
    };
  }

  const stickyGapColumns = safeColumns - 1;
  const clusterWidth =
    STICKY_BATCH_TOOL_SIZE.width + stickyGapColumns * Math.max(batchSize.gapX, 1);
  const rows = Math.max(1, Math.ceil(batchSize.count / safeColumns));
  const clusterHeight =
    STICKY_BATCH_TOOL_SIZE.height +
    Math.max(0, rows - 1) * Math.max(batchSize.gapY, 1);

  const minX = container.x + STICKY_FRAME_PADDING;
  const maxX = container.x + container.width - STICKY_FRAME_PADDING - clusterWidth;
  const minY = container.y + STICKY_FRAME_PADDING;
  const maxY = container.y + container.height - STICKY_FRAME_PADDING - clusterHeight;

  const clampOrFallback = (value: number, min: number, max: number): number =>
    max < min ? min : Math.min(max, Math.max(min, value));

  if (side === "left") {
    return {
      x: clampOrFallback(minX, minX, maxX),
      y: clampOrFallback(fallbackY, minY, maxY),
    };
  }
  if (side === "right") {
    return {
      x: clampOrFallback(maxX, minX, maxX),
      y: clampOrFallback(fallbackY, minY, maxY),
    };
  }
  if (side === "top") {
    return {
      x: clampOrFallback(fallbackX, minX, maxX),
      y: clampOrFallback(minY, minY, maxY),
    };
  }

  return {
    x: clampOrFallback(fallbackX, minX, maxX),
    y: clampOrFallback(maxY, minY, maxY),
  };
}

export function clampPointToFrameBounds(
  point: Point,
  frame: BoardObjectSnapshot,
): Point {
  return {
    x: Math.max(
      frame.x + STICKY_FRAME_PADDING,
      Math.min(
        point.x,
        frame.x + frame.width - STICKY_FRAME_PADDING - STICKY_BATCH_TOOL_SIZE.width,
      ),
    ),
    y: Math.max(
      frame.y + STICKY_FRAME_PADDING,
      Math.min(
        point.y,
        frame.y +
          frame.height -
          STICKY_FRAME_PADDING -
          STICKY_BATCH_TOOL_SIZE.height,
      ),
    ),
  };
}

export function parseDistributionAxis(
  message: string,
): "horizontal" | "vertical" {
  const lower = normalizeMessage(message);
  if (/\bvertical\b|\bvertically\b|\by-axis\b|\bup\b|\bdown\b/.test(lower)) {
    return "vertical";
  }

  return "horizontal";
}

export function isViewportDistributionRequested(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bacross\b[\w\s]{0,24}\b(screen|viewport|canvas|view)\b/.test(lower) ||
    /\bto\s+the\s+edges?\b/.test(lower) ||
    /\bfull\s+(width|height)\b/.test(lower)
  );
}

export function getBoardBounds(boardState: BoardObjectSnapshot[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
} | null {
  if (boardState.length === 0) {
    return null;
  }

  const left = Math.min(...boardState.map((objectItem) => objectItem.x));
  const right = Math.max(
    ...boardState.map((objectItem) => objectItem.x + objectItem.width),
  );
  const top = Math.min(...boardState.map((objectItem) => objectItem.y));
  const bottom = Math.max(
    ...boardState.map((objectItem) => objectItem.y + objectItem.height),
  );

  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function getAutoSpawnPoint(boardState: BoardObjectSnapshot[]): Point {
  const bounds = getBoardBounds(boardState);
  if (!bounds) {
    return { x: 160, y: 120 };
  }

  return {
    x: bounds.right + 100,
    y: bounds.top,
  };
}

export function parseDirectionDelta(message: string): Point | null {
  const match = message.match(
    /\b(right|left|up|down)\b(?:\s+by\s+(-?\d+(?:\.\d+)?))?/i,
  );
  if (!match) {
    return null;
  }

  const direction = match[1].toLowerCase();
  const amount = Math.max(1, Number(match[2] ?? 120));

  if (direction === "right") {
    return { x: amount, y: 0 };
  }
  if (direction === "left") {
    return { x: -amount, y: 0 };
  }
  if (direction === "up") {
    return { x: 0, y: -amount };
  }
  return { x: 0, y: amount };
}

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

  const clauses = matches.map((startIndex, index) => {
    const endIndex = matches[index + 1] ?? message.length;
    return message.slice(startIndex, endIndex).trim();
  });

  return clauses.filter((clause) => clause.length > 0);
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

  const clampOrFallback = (value: number, min: number, max: number): number => {
    if (max < min) {
      return min;
    }
    return Math.min(max, Math.max(min, value));
  };

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

export function parseSwotSectionTarget(
  message: string,
  swotSectionKeys: string[],
  swotSectionAliases: Record<string, string[]>,
): string | null {
  const lower = normalizeMessage(message);
  for (const key of swotSectionKeys) {
    const aliases = swotSectionAliases[key] ?? [];
    const hasMatch = aliases.some((alias) =>
      new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(lower),
    );
    if (hasMatch) {
      return key;
    }
  }

  return null;
}
