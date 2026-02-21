import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  BoardSelectionUpdate,
  TemplatePlan,
} from "@/features/ai/types";
import {
  clampObjectTopLeftToSection,
  getGridSectionBoundsFromGeometry,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";

type PlannerInput = {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};

export type DeterministicCommandPlanResult =
  | {
      planned: true;
      intent: string;
      assistantMessage: string;
      plan: TemplatePlan;
      selectionUpdate?: BoardSelectionUpdate;
    }
  | {
      planned: false;
      intent: string;
      assistantMessage: string;
      selectionUpdate?: BoardSelectionUpdate;
    };

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type SwotSectionKey =
  | "strengths"
  | "weaknesses"
  | "opportunities"
  | "threats";

const COLOR_KEYWORDS: Record<string, string> = {
  yellow: "#fde68a",
  orange: "#fdba74",
  red: "#fca5a5",
  pink: "#f9a8d4",
  purple: "#c4b5fd",
  blue: "#93c5fd",
  teal: "#99f6e4",
  green: "#86efac",
  gray: "#d1d5db",
  grey: "#d1d5db",
  tan: "#d2b48c",
  black: "#1f2937",
};

const DEFAULT_SIZES: Record<BoardObjectToolKind, Size> = {
  sticky: { width: 220, height: 170 },
  rect: { width: 240, height: 150 },
  circle: { width: 170, height: 170 },
  gridContainer: { width: 708, height: 468 },
  line: { width: 240, height: 64 },
  connectorUndirected: { width: 220, height: 120 },
  connectorArrow: { width: 220, height: 120 },
  connectorBidirectional: { width: 220, height: 120 },
  triangle: { width: 180, height: 170 },
  star: { width: 180, height: 180 },
};

const GRID_DEFAULT_COLUMNS = 3;
const STICKY_GRID_SPACING_X = 240;
const STICKY_GRID_SPACING_Y = 190;
const STICKY_BATCH_DEFAULT_COLUMNS = 5;
const MAX_STICKY_BATCH_COUNT = 50;
const MAX_SUMMARY_BULLETS = 5;
const MAX_ACTION_ITEM_CANDIDATES = 8;
const ACTION_ITEM_GRID_COLUMNS = 4;
const ACTION_ITEM_SPACING_X = 240;
const ACTION_ITEM_SPACING_Y = 190;
const ACTION_ITEM_COLOR = COLOR_KEYWORDS.green;
const JOURNEY_DEFAULT_STAGES = 5;
const JOURNEY_MIN_STAGES = 3;
const JOURNEY_MAX_STAGES = 8;
const JOURNEY_STAGE_SPACING_X = 230;
const RETRO_COLUMN_SPACING_X = 320;
const MAX_MOVE_OBJECTS = 500;
const DEFAULT_FRAME_FIT_PADDING = 40;
const STICKY_FRAME_PADDING = 24;
const STICKY_BATCH_TOOL_SIZE = {
  width: 180,
  height: 140,
};
const STICKY_VIEWPORT_PADDING = 32;
const SWOT_SECTION_KEYS: SwotSectionKey[] = [
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
];
const SWOT_SECTION_ALIASES: Record<SwotSectionKey, string[]> = {
  strengths: ["strength", "strengths"],
  weaknesses: ["weakness", "weaknesses"],
  opportunities: ["opportunity", "opportunities"],
  threats: ["threat", "threats"],
};
const SWOT_SECTION_DEFAULT_INDEX: Record<SwotSectionKey, number> = {
  strengths: 0,
  weaknesses: 1,
  opportunities: 2,
  threats: 3,
};
const SWOT_SECTION_STICKY_COLORS: Record<SwotSectionKey, string> = {
  strengths: COLOR_KEYWORDS.green,
  weaknesses: COLOR_KEYWORDS.red,
  opportunities: COLOR_KEYWORDS.teal,
  threats: COLOR_KEYWORDS.orange,
};

/**
 * Escapes text for regex usage.
 */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Handles normalize message.
 */
function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

/**
 * Gets selected objects.
 */
function getSelectedObjects(
  boardState: BoardObjectSnapshot[],
  selectedIds: string[],
): BoardObjectSnapshot[] {
  const byId = new Map(
    boardState.map((objectItem) => [objectItem.id, objectItem]),
  );
  return selectedIds
    .map((objectId) => byId.get(objectId))
    .filter((objectItem): objectItem is BoardObjectSnapshot =>
      Boolean(objectItem),
    );
}

/**
 * Returns whether object intersects viewport bounds.
 */
function getIntersectionBounds(
  objectItem: BoardObjectSnapshot,
  viewportBounds: NonNullable<PlannerInput["viewportBounds"]>,
): boolean {
  const objectRight = objectItem.x + objectItem.width;
  const objectBottom = objectItem.y + objectItem.height;
  const viewportRight = viewportBounds.left + viewportBounds.width;
  const viewportBottom = viewportBounds.top + viewportBounds.height;

  return (
    objectItem.x < viewportRight &&
    objectRight > viewportBounds.left &&
    objectItem.y < viewportBottom &&
    objectBottom > viewportBounds.top
  );
}

/**
 * Returns whether object has usable text is true.
 */
function hasUsableText(objectItem: BoardObjectSnapshot): boolean {
  return objectItem.text.trim().length > 0;
}

/**
 * Gets text-capable objects.
 */
function getTextObjects(boardState: BoardObjectSnapshot[]): BoardObjectSnapshot[] {
  return boardState.filter(hasUsableText);
}

/**
 * Handles to text snippet.
 */
function toTextSnippet(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength).trimEnd()}...`;
}

/**
 * Gets analysis source objects.
 */
function getAnalysisSource(input: PlannerInput): {
  sourceObjects: BoardObjectSnapshot[];
  scope: "selected" | "board" | "none";
} {
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  ).filter(hasUsableText);
  if (selectedObjects.length > 0) {
    return {
      sourceObjects: selectedObjects,
      scope: "selected",
    };
  }

  const normalized = normalizeMessage(input.message);
  if (/\b(board|all)\b/.test(normalized)) {
    const boardObjects = getTextObjects(input.boardState);
    return {
      sourceObjects: boardObjects,
      scope: boardObjects.length > 0 ? "board" : "none",
    };
  }

  return {
    sourceObjects: [],
    scope: "none",
  };
}

/**
 * Parses action-item candidates.
 */
function parseActionItemCandidates(
  sourceObjects: BoardObjectSnapshot[],
): string[] {
  const seen = new Set<string>();
  const candidates: string[] = [];

  sourceObjects.forEach((objectItem) => {
    objectItem.text
      .split(/[\n.;]+/)
      .map((segment) =>
        segment
          .replace(/^[-*\d)\].\s]+/, "")
          .replace(/\s+/g, " ")
          .trim(),
      )
      .filter((segment) => segment.length >= 4)
      .forEach((segment) => {
        if (candidates.length >= MAX_ACTION_ITEM_CANDIDATES) {
          return;
        }
        const key = segment.toLowerCase();
        if (seen.has(key)) {
          return;
        }

        seen.add(key);
        candidates.push(segment);
      });
  });

  return candidates;
}

/**
 * Handles find color.
 */
function findColor(message: string): string | null {
  const lower = normalizeMessage(message);
  const key = Object.keys(COLOR_KEYWORDS).find((colorName) =>
    new RegExp(`\\b${colorName}\\b`, "i").test(lower),
  );
  return key ? COLOR_KEYWORDS[key] : null;
}

/**
 * Parses coordinate point.
 */
function parseCoordinatePoint(message: string): Point | null {
  const xyMatch = message.match(
    /\bx\s*=?\s*(-?\d+(?:\.\d+)?)\s*y\s*=?\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (xyMatch) {
    return {
      x: Number(xyMatch[1]),
      y: Number(xyMatch[2]),
    };
  }

  const atMatch = message.match(
    /\b(?:at|to)\s*(?:position\s*)?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (!atMatch) {
    return null;
  }

  return {
    x: Number(atMatch[1]),
    y: Number(atMatch[2]),
  };
}

/**
 * Parses size.
 */
function parseSize(message: string): Size | null {
  const sizeMatch = message.match(
    /\b(?:size|to)\s*(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)/i,
  );
  if (!sizeMatch) {
    return null;
  }

  return {
    width: Math.max(1, Number(sizeMatch[1])),
    height: Math.max(1, Number(sizeMatch[2])),
  };
}

/**
 * Parses padding value.
 */
function parsePadding(message: string): number | null {
  const paddingMatch = message.match(/\bpadding\s*(-?\d+(?:\.\d+)?)\b/i);
  if (!paddingMatch) {
    return null;
  }

  return Math.max(0, Number(paddingMatch[1]));
}

/**
 * Handles to positive integer.
 */
function toPositiveInteger(value: string): number {
  return Math.max(1, Math.floor(Number(value)));
}

/**
 * Parses grid dimensions.
 */
function parseGridDimensions(message: string): {
  rows: number;
  columns: number;
} | null {
  const dimsMatch = message.match(
    /\b(\d+)\s*(?:x|by)\s*(\d+)\b/i,
  );
  if (!dimsMatch) {
    return null;
  }

  return {
    rows: toPositiveInteger(dimsMatch[1]),
    columns: toPositiveInteger(dimsMatch[2]),
  };
}

/**
 * Parses grid columns.
 */
function parseGridColumns(message: string): number | null {
  const dimensions = parseGridDimensions(message);
  if (dimensions) {
    return dimensions.columns;
  }

  const columnsMatch = message.match(/\b(\d+)\s+columns?\b/i);
  if (!columnsMatch) {
    return null;
  }

  return toPositiveInteger(columnsMatch[1]);
}

/**
 * Parses journey map stage count.
 */
function parseJourneyStageCount(message: string): number | null {
  const stageMatch = message.match(/\b(\d+)\s*(?:-|\s)?stages?\b/i);
  if (!stageMatch) {
    return null;
  }

  return toPositiveInteger(stageMatch[1]);
}

/**
 * Parses grid gap.
 */
function parseGridGap(message: string): {
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

/**
 * Parses alignment mode.
 */
function parseAlignmentMode(message: string):
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

/**
 * Returns true if user asked to add objects to a frame/container target.
 */
function isAddToContainerCommand(message: string): boolean {
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
    /\b(frame|container)\b[\w\s]{0,6}\b(?:to|into|inside|within|in)\b/.test(lower)
  );
}

/**
 * Returns true when object should be treated as frame/container target.
 */
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

/**
 * Gets all container-like objects from board state.
 */
function getContainerObjects(
  boardState: BoardObjectSnapshot[],
): BoardObjectSnapshot[] {
  return boardState.filter(isContainerObject);
}

/**
 * Gets selected objects that are container-like targets.
 */
function getSelectedContainerObjects(
  boardState: BoardObjectSnapshot[],
  selectedObjectIds: string[],
): BoardObjectSnapshot[] {
  const selectedObjects = getSelectedObjects(boardState, selectedObjectIds);
  return selectedObjects.filter(isContainerObject);
}
type FrameTarget = {
  id: string;
  object: BoardObjectSnapshot;
  reason: "selected" | "visible" | "single-frame";
};

/**
 * Resolves a likely target frame/container for sticky-in-frame commands.
 */
function resolveContainerTarget(input: PlannerInput): FrameTarget | null {
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

  if (containers.length > 1) {
    return null;
  }

  return null;
}

/**
 * Returns frame-relative origin for container-bound sticky placement.
 */
function resolveContainerStickyOrigin(
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

/**
 * Clamps sticky origin to frame inner bounds.
 */
function clampPointToFrameBounds(
  point: Point,
  frame: BoardObjectSnapshot,
): Point {
  return {
    x: Math.max(
      frame.x + STICKY_FRAME_PADDING,
      Math.min(point.x, frame.x + frame.width - STICKY_FRAME_PADDING - STICKY_BATCH_TOOL_SIZE.width),
    ),
    y: Math.max(
      frame.y + STICKY_FRAME_PADDING,
      Math.min(point.y, frame.y + frame.height - STICKY_FRAME_PADDING - STICKY_BATCH_TOOL_SIZE.height),
    ),
  };
}

/**
 * Parses distribution axis.
 */
function parseDistributionAxis(message: string): "horizontal" | "vertical" {
  const lower = normalizeMessage(message);
  if (/\bvertical\b|\bvertically\b|\by-axis\b|\bup\b|\bdown\b/.test(lower)) {
    return "vertical";
  }

  return "horizontal";
}

/**
 * Gets board bounds.
 */
function getBoardBounds(boardState: BoardObjectSnapshot[]): {
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

/**
 * Gets auto spawn point.
 */
function getAutoSpawnPoint(boardState: BoardObjectSnapshot[]): Point {
  const bounds = getBoardBounds(boardState);
  if (!bounds) {
    return { x: 160, y: 120 };
  }

  return {
    x: bounds.right + 100,
    y: bounds.top,
  };
}

/**
 * Parses direction delta.
 */
function parseDirectionDelta(message: string): Point | null {
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

/**
 * Parses side target.
 */
function parseSideTarget(message: string): "left" | "right" | "top" | "bottom" | null {
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

/**
 * Normalizes known frame title typos and preserves user intent.
 */
function normalizeFrameTitle(rawTitle: string): string {
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
    .map((word) => {
      const lowercase = word.toLowerCase();
      const correctedWord = corrected[lowercase];
      if (!correctedWord) {
        return word;
      }
      return correctedWord;
    })
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

/**
 * Parses sticky text.
 */
function parseStickyText(message: string): string {
  const textMatch = message.match(
    /\b(?:that says|saying|with text|text)\b\s+["“']?(.+?)["”']?$/i,
  );
  if (!textMatch) {
    return "New sticky note";
  }

  const value = textMatch[1].trim();
  return value.length > 0 ? value.slice(0, 1_000) : "New sticky note";
}

/**
 * Parses sticky grid text seed.
 */
function parseStickyGridTextSeed(message: string): string | null {
  const suffixMatch = message.match(/\bfor\b\s+["“']?(.+?)["”']?$/i);
  if (!suffixMatch) {
    return null;
  }

  const value = suffixMatch[1].trim();
  return value.length > 0 ? value.slice(0, 960) : null;
}

/**
 * Parses sticky batch count.
 */
function parseStickyBatchCount(message: string): number | null {
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

type ParsedStickyBatchClause = {
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

/**
 * Splits a sticky batch message into create/add/create-like clauses.
 */
function splitStickyCreationClauses(message: string): string[] {
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

/**
 * Parses sticky batch intent from one clause.
 */
function parseStickyBatchClause(
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

/**
 * Gets viewport-anchored origin for sticky creation.
 */
function getViewportAnchoredStickyOrigin(options: {
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
  const safeCount = Math.max(1, Math.floor(options.count));
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

/**
 * Parses SWOT section target from message.
 */
function parseSwotSectionTarget(message: string): SwotSectionKey | null {
  const lower = normalizeMessage(message);

  for (const key of SWOT_SECTION_KEYS) {
    const hasMatch = SWOT_SECTION_ALIASES[key].some((alias) =>
      new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(lower),
    );
    if (hasMatch) {
      return key;
    }
  }

  return null;
}

/**
 * Parses SWOT item text from message.
 */
function parseSwotItemText(
  message: string,
  section: SwotSectionKey,
): string | null {
  const quotedMatch = message.match(/["“”']([^"“”']+)["“”']/);
  if (quotedMatch) {
    return quotedMatch[1].trim().slice(0, 1_000);
  }

  const aliases = SWOT_SECTION_ALIASES[section]
    .map((alias) => escapeRegex(alias))
    .join("|");
  const trailingMatch = message.match(
    new RegExp(`\\b(?:${aliases})\\b\\s*(?:-|:|=)?\\s*(.+)$`, "i"),
  );
  if (!trailingMatch) {
    return null;
  }

  const value = trailingMatch[1]
    .trim()
    .replace(/^(?:note|item)\s*(?:-|:)?\s*/i, "")
    .trim();
  if (value.length === 0) {
    return null;
  }

  return value.slice(0, 1_000);
}

/**
 * Finds SWOT section placement bounds for targeted section.
 */
function findSwotSectionPlacement(options: {
  boardState: BoardObjectSnapshot[];
  section: SwotSectionKey;
}):
  | {
      containerId: string;
      sectionIndex: number;
      sectionBounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      };
    }
  | null {
  const containers = options.boardState
    .filter((objectItem) => objectItem.type === "gridContainer")
    .sort((left, right) => right.zIndex - left.zIndex);

  for (const container of containers) {
    const rows = Math.max(1, container.gridRows ?? 2);
    const cols = Math.max(1, container.gridCols ?? 2);
    const gap = Math.max(0, container.gridGap ?? 2);
    const sectionBounds = getGridSectionBoundsFromGeometry(
      {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      },
      rows,
      cols,
      gap,
    );
    const totalSections = sectionBounds.length;
    if (totalSections === 0) {
      continue;
    }

    const sectionTitles = Array.from(
      { length: totalSections },
      (_, index) => container.gridSectionTitles?.[index]?.trim() ?? "",
    );
    const aliasForTarget = SWOT_SECTION_ALIASES[options.section];
    const explicitSectionIndex = sectionTitles.findIndex((title) => {
      const lowerTitle = title.toLowerCase();
      return aliasForTarget.some((alias) => lowerTitle.includes(alias));
    });
    if (explicitSectionIndex >= 0) {
      return {
        containerId: container.id,
        sectionIndex: explicitSectionIndex,
        sectionBounds: sectionBounds[explicitSectionIndex]!,
      };
    }

    const isSwotContainer = (container.containerTitle ?? "")
      .toLowerCase()
      .includes("swot");
    if (!isSwotContainer) {
      continue;
    }

    const defaultSectionIndex = SWOT_SECTION_DEFAULT_INDEX[options.section];
    if (defaultSectionIndex >= totalSections) {
      continue;
    }

    return {
      containerId: container.id,
      sectionIndex: defaultSectionIndex,
      sectionBounds: sectionBounds[defaultSectionIndex]!,
    };
  }

  return null;
}

/**
 * Parses shape type.
 */
function parseShapeType(message: string): BoardObjectToolKind | null {
  const lower = normalizeMessage(message);
  if (/\bsticky(?:\s+note)?s?\b/.test(lower)) {
    return "sticky";
  }
  if (/\brect(?:angle)?s?\b/.test(lower)) {
    return "rect";
  }
  if (/\bcircles?\b/.test(lower)) {
    return "circle";
  }
  if (/\blines?\b/.test(lower)) {
    return "line";
  }
  if (/\btriangles?\b/.test(lower)) {
    return "triangle";
  }
  if (/\bstars?\b/.test(lower)) {
    return "star";
  }

  return null;
}

/**
 * Handles to plan.
 */
function toPlan(options: {
  id: string;
  name: string;
  operations: BoardToolCall[];
}): TemplatePlan {
  return {
    templateId: options.id,
    templateName: options.name,
    operations: options.operations,
  };
}

/**
 * Returns whether clear board command is true.
 */
function isClearBoardCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bclear(?:\s+the)?\s+board\b/.test(lower) ||
    /\bdelete\s+all\s+shapes\b/.test(lower) ||
    /\bremove\s+all\s+shapes\b/.test(lower) ||
    /\b(?:delete|remove)\s+everything(?:\s+on\s+the\s+board)?\b/.test(lower) ||
    /\bwipe\s+the\s+board\b/.test(lower)
  );
}

/**
 * Returns whether unselect command is true.
 */
function isUnselectCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bunselect\b/.test(lower) ||
    /\bdeselect\b/.test(lower) ||
    /\bclear\s+selection\b/.test(lower) ||
    /\bclear\s+selected\b/.test(lower) ||
    /\bclear\s+objects\b/.test(lower)
  );
}

/**
 * Plans unselect command.
 */
function planUnselectObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isUnselectCommand(input.message)) {
    return null;
  }

  return {
    planned: true,
    intent: "unselect",
    assistantMessage: "Selection cleared.",
    plan: toPlan({
      id: "command.unselect",
      name: "Unselect Objects",
      operations: [],
    }),
    selectionUpdate: {
      mode: "clear",
      objectIds: [],
    },
  };
}

/**
 * Returns whether select-all command is true.
 */
function isSelectAllCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return /\bselect\s+(all|everything)\b/.test(lower);
}

/**
 * Returns whether select-visible command is true.
 */
function isSelectVisibleCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return /\bselect\s+visible\b/.test(lower);
}

/**
 * Plans select-all command.
 */
function planSelectAllObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSelectAllCommand(input.message)) {
    return null;
  }

  if (input.boardState.length === 0) {
    return {
      planned: true,
      intent: "select-all",
      assistantMessage: "No objects on board to select.",
      plan: toPlan({
        id: "command.select-all",
        name: "Select All Objects",
        operations: [],
      }),
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
    };
  }

  return {
    planned: true,
    intent: "select-all",
    assistantMessage: `Selected ${input.boardState.length} object${input.boardState.length === 1 ? "" : "s"} on the board.`,
    plan: toPlan({
      id: "command.select-all",
      name: "Select All Objects",
      operations: [],
    }),
    selectionUpdate: {
      mode: "replace",
      objectIds: input.boardState.map((objectItem) => objectItem.id),
    },
  };
}

/**
 * Plans select-visible command.
 */
function planSelectVisibleObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSelectVisibleCommand(input.message)) {
    return null;
  }

  if (!input.viewportBounds) {
    return {
      planned: true,
      intent: "select-visible",
      assistantMessage:
        "No viewport information was provided, so I could not resolve visible selection.",
      plan: toPlan({
        id: "command.select-visible",
        name: "Select Visible Objects",
        operations: [],
      }),
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
    };
  }

  const visibleObjectIds = input.boardState
    .filter((objectItem) => getIntersectionBounds(objectItem, input.viewportBounds!))
    .map((objectItem) => objectItem.id);

  if (visibleObjectIds.length === 0) {
    return {
      planned: true,
      intent: "select-visible",
      assistantMessage: "No visible objects to select in the current viewport.",
      plan: toPlan({
        id: "command.select-visible",
        name: "Select Visible Objects",
        operations: [],
      }),
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
    };
  }

  return {
    planned: true,
    intent: "select-visible",
    assistantMessage: `Selected ${visibleObjectIds.length} visible object${visibleObjectIds.length === 1 ? "" : "s"} in view.`,
    plan: toPlan({
      id: "command.select-visible",
      name: "Select Visible Objects",
      operations: [],
    }),
    selectionUpdate: {
      mode: "replace",
      objectIds: visibleObjectIds,
    },
  };
}

/**
 * Handles plan clear board.
 */
function planClearBoard(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isClearBoardCommand(input.message)) {
    return null;
  }

  if (input.boardState.length === 0) {
    return {
      planned: false,
      intent: "clear-board-empty",
      assistantMessage: "Board is already empty.",
    };
  }

  return {
    planned: true,
    intent: "clear-board",
    assistantMessage: `Cleared board and deleted ${input.boardState.length} object${input.boardState.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.clear-board",
      name: "Clear Board",
      operations: [
        {
          tool: "deleteObjects",
          args: {
            objectIds: input.boardState.map((objectItem) => objectItem.id),
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether delete selected command is true.
 */
function isDeleteSelectedCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(delete|remove)\b[\w\s]*\bselected\b/.test(lower) ||
    /\bdelete\s+selection\b/.test(lower) ||
    /\bremove\s+selection\b/.test(lower)
  );
}

/**
 * Handles plan delete selected.
 */
function planDeleteSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isDeleteSelectedCommand(input.message)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "delete-selected",
      assistantMessage:
        "Select one or more objects first, then run delete selected.",
    };
  }

  return {
    planned: true,
    intent: "delete-selected",
    assistantMessage: `Deleted ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.delete-selected",
      name: "Delete Selected Objects",
      operations: [
        {
          tool: "deleteObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether arrange-grid command is true.
 */
function isArrangeGridCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasArrangeVerb = /\b(arrange|organize|organise|layout|lay\s*out)\b/.test(
    lower,
  );
  const hasGridLanguage = /\bgrid\b/.test(lower) || /\bcolumns?\b/.test(lower);
  return hasArrangeVerb && hasGridLanguage;
}

/**
 * Handles plan arrange grid.
 */
function planArrangeGrid(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isArrangeGridCommand(input.message)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length < 2) {
    return {
      planned: false,
      intent: "arrange-grid",
      assistantMessage: "Select two or more objects, then run arrange in grid.",
    };
  }

  const columns = parseGridColumns(input.message) ?? GRID_DEFAULT_COLUMNS;
  const gap = parseGridGap(input.message);

  return {
    planned: true,
    intent: "arrange-grid",
    assistantMessage: `Arranged ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} in a grid.`,
    plan: toPlan({
      id: "command.arrange-grid",
      name: "Arrange Selected Objects In Grid",
      operations: [
        {
          tool: "arrangeObjectsInGrid",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            columns,
            ...(gap?.gapX !== undefined ? { gapX: gap.gapX } : {}),
            ...(gap?.gapY !== undefined ? { gapY: gap.gapY } : {}),
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether align command is true.
 */
function isAlignCommand(message: string): boolean {
  return /\balign\b/.test(normalizeMessage(message));
}

/**
 * Handles plan align selected.
 */
function planAlignSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isAlignCommand(input.message)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length < 2) {
    return {
      planned: false,
      intent: "align-objects",
      assistantMessage:
        "Select two or more objects first, then run align selected.",
    };
  }

  const alignment = parseAlignmentMode(input.message);
  if (!alignment) {
    return {
      planned: false,
      intent: "align-objects",
      assistantMessage:
        "Specify alignment direction: left, center, right, top, middle, or bottom.",
    };
  }

  return {
    planned: true,
    intent: "align-objects",
    assistantMessage: `Aligned ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} to ${alignment}.`,
    plan: toPlan({
      id: "command.align-selected",
      name: "Align Selected Objects",
      operations: [
        {
          tool: "alignObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            alignment,
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether distribute command is true.
 */
function isDistributeCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bdistribute\b/.test(lower) ||
    /\bspace\b[\w\s]{0,25}\bevenly\b/.test(lower) ||
    /\bevenly\b[\w\s]{0,25}\bspace\b/.test(lower)
  );
}

/**
 * Handles plan distribute selected.
 */
function planDistributeSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isDistributeCommand(input.message)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length < 3) {
    return {
      planned: false,
      intent: "distribute-objects",
      assistantMessage:
        "Select three or more objects first, then run distribute selected.",
    };
  }

  const axis = parseDistributionAxis(input.message);
  return {
    planned: true,
    intent: "distribute-objects",
    assistantMessage: `Distributed ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} on ${axis} axis.`,
    plan: toPlan({
      id: "command.distribute-selected",
      name: "Distribute Selected Objects",
      operations: [
        {
          tool: "distributeObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            axis,
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether summarize command is true.
 */
function isSummarizeCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(summarize|summarise|summary|recap)\b/.test(lower) &&
    !/\b(action items?|next steps?|todo|to-do)\b/.test(lower)
  );
}

/**
 * Handles plan summarize source.
 */
function planSummarizeSource(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSummarizeCommand(input.message)) {
    return null;
  }

  const analysis = getAnalysisSource(input);
  if (analysis.sourceObjects.length === 0) {
    return {
      planned: false,
      intent: "summarize-selected",
      assistantMessage:
        "Select one or more text objects first, or say summarize the board.",
    };
  }

  const bullets = analysis.sourceObjects
    .slice(0, MAX_SUMMARY_BULLETS)
    .map((objectItem) => `- ${toTextSnippet(objectItem.text, 120)}`);
  const heading =
    analysis.scope === "selected"
      ? `Summary of selected notes (${analysis.sourceObjects.length}):`
      : `Summary of board notes (${analysis.sourceObjects.length}):`;
  const assistantMessage = [heading, ...bullets].join("\n").slice(0, 1_000);

  return {
    planned: false,
    intent: "summarize-selected",
    assistantMessage,
  };
}

/**
 * Returns whether action-item extraction command is true.
 */
function isActionItemExtractionCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasActionLanguage =
    /\b(action items?|next steps?|todo|to-do)\b/.test(lower);
  const hasExtractionLanguage =
    /\b(extract|generate|create|make|convert|turn)\b/.test(lower);

  return hasActionLanguage && hasExtractionLanguage;
}

/**
 * Handles plan extract action items.
 */
function planExtractActionItems(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isActionItemExtractionCommand(input.message)) {
    return null;
  }

  const analysis = getAnalysisSource(input);
  if (analysis.sourceObjects.length === 0) {
    return {
      planned: false,
      intent: "extract-action-items",
      assistantMessage:
        "Select one or more text objects first, or say create action items for the board.",
    };
  }

  const candidates = parseActionItemCandidates(analysis.sourceObjects);
  if (candidates.length === 0) {
    return {
      planned: false,
      intent: "extract-action-items",
      assistantMessage:
        "I could not find clear action-item text. Try selecting notes with concrete tasks.",
    };
  }

  const spawnPoint = getAutoSpawnPoint(input.boardState);
  const columns = Math.min(ACTION_ITEM_GRID_COLUMNS, candidates.length);
  const operations: BoardToolCall[] = candidates.map((candidate, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      tool: "createStickyNote",
      args: {
        text: `Action ${index + 1}: ${toTextSnippet(candidate, 110)}`.slice(0, 1_000),
        x: spawnPoint.x + column * ACTION_ITEM_SPACING_X,
        y: spawnPoint.y + row * ACTION_ITEM_SPACING_Y,
        color: ACTION_ITEM_COLOR,
      },
    };
  });

  return {
    planned: true,
    intent: "extract-action-items",
    assistantMessage: `Created ${operations.length} action-item sticky notes from ${analysis.scope === "selected" ? "selected notes" : "board notes"}.`,
    plan: toPlan({
      id: "command.extract-action-items",
      name: "Extract Action Items",
      operations,
    }),
  };
}

/**
 * Returns whether create sticky-grid command is true.
 */
function isCreateStickyGridCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(add|create)\b/.test(lower) &&
    /\bgrid\b/.test(lower) &&
    /\bsticky(?:\s+note)?s?\b/.test(lower)
  );
}

/**
 * Handles plan create sticky-grid.
 */
function planCreateStickyGrid(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateStickyGridCommand(input.message)) {
    return null;
  }

  const dimensions = parseGridDimensions(input.message);
  if (!dimensions) {
    return {
      planned: false,
      intent: "create-sticky-grid",
      assistantMessage:
        "Specify sticky grid dimensions, for example: create a 2x3 grid of sticky notes.",
    };
  }

  const point = getAutoSpawnPoint(input.boardState);
  const color = findColor(input.message) ?? COLOR_KEYWORDS.yellow;
  const textSeed = parseStickyGridTextSeed(input.message);
  const total = dimensions.rows * dimensions.columns;

  if (total > MAX_STICKY_BATCH_COUNT) {
    return {
      planned: false,
      intent: "create-sticky-grid",
      assistantMessage: `Create sticky grids up to ${MAX_STICKY_BATCH_COUNT} notes per command.`,
    };
  }

  return {
    planned: true,
    intent: "create-sticky-grid",
    assistantMessage: `Created ${dimensions.rows}x${dimensions.columns} sticky grid (${total} notes).`,
    plan: toPlan({
      id: "command.create-sticky-grid",
      name: "Create Sticky Note Grid",
      operations: [
        {
          tool: "createStickyBatch",
          args: {
            count: total,
            color,
            originX: point.x,
            originY: point.y,
            columns: dimensions.columns,
            gapX: STICKY_GRID_SPACING_X,
            gapY: STICKY_GRID_SPACING_Y,
            textPrefix: textSeed ?? "Sticky",
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether create SWOT template command is true.
 */
function isCreateSwotTemplateCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasSwotLanguage = /\bswot\b/.test(lower);
  const hasTemplateLanguage = /\b(template|analysis|board|diagram)\b/.test(
    lower,
  );

  return hasCreateVerb && hasSwotLanguage && hasTemplateLanguage;
}

/**
 * Handles plan create SWOT template.
 */
function planCreateSwotTemplate(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateSwotTemplateCommand(input.message)) {
    return null;
  }

  return {
    planned: true,
    intent: "swot-template",
    assistantMessage: "Created SWOT analysis template.",
    plan: buildSwotTemplatePlan({
      templateId: "swot.v1",
      boardBounds: getBoardBounds(input.boardState),
      selectedObjectIds: input.selectedObjectIds,
      existingObjectCount: input.boardState.length,
      viewportBounds: input.viewportBounds ?? null,
    }),
  };
}

/**
 * Returns whether create journey-map command is true.
 */
function isCreateJourneyMapCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasJourneyLanguage =
    /\bjourney\s+map\b/.test(lower) || /\buser\s+journey\b/.test(lower);
  return hasCreateVerb && hasJourneyLanguage;
}

/**
 * Handles plan create journey-map.
 */
function planCreateJourneyMap(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateJourneyMapCommand(input.message)) {
    return null;
  }

  const stageCount = parseJourneyStageCount(input.message) ?? JOURNEY_DEFAULT_STAGES;
  if (stageCount < JOURNEY_MIN_STAGES || stageCount > JOURNEY_MAX_STAGES) {
    return {
      planned: false,
      intent: "create-journey-map",
      assistantMessage: `Create journey maps with ${JOURNEY_MIN_STAGES}-${JOURNEY_MAX_STAGES} stages.`,
    };
  }

  const spawnPoint =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const frameWidth = Math.max(760, stageCount * JOURNEY_STAGE_SPACING_X + 120);
  const stageNames = [
    "Discover",
    "Consider",
    "Sign Up",
    "Onboard",
    "Adopt",
    "Retain",
    "Advocate",
    "Renew",
  ];

  const operations: BoardToolCall[] = [
    {
      tool: "createFrame",
      args: {
        title: `User Journey Map (${stageCount} stages)`,
        x: spawnPoint.x,
        y: spawnPoint.y,
        width: frameWidth,
        height: 360,
      },
    },
  ];

  for (let index = 0; index < stageCount; index += 1) {
    operations.push({
      tool: "createStickyNote",
      args: {
        text: `${index + 1}. ${stageNames[index] ?? `Stage ${index + 1}`}`,
        x: spawnPoint.x + 30 + index * JOURNEY_STAGE_SPACING_X,
        y: spawnPoint.y + 88,
        color: COLOR_KEYWORDS.yellow,
      },
    });
  }

  return {
    planned: true,
    intent: "create-journey-map",
    assistantMessage: `Created user journey map with ${stageCount} stages.`,
    plan: toPlan({
      id: "command.create-journey-map",
      name: "Create User Journey Map",
      operations,
    }),
  };
}

/**
 * Returns whether create retrospective-board command is true.
 */
function isCreateRetrospectiveCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasRetroLanguage = /\b(retrospective|retro)\b/.test(lower);
  return hasCreateVerb && hasRetroLanguage;
}

/**
 * Handles plan create retrospective-board.
 */
function planCreateRetrospectiveBoard(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateRetrospectiveCommand(input.message)) {
    return null;
  }

  const spawnPoint =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const columns = [
    { title: "What Went Well", color: COLOR_KEYWORDS.green },
    { title: "What Didn't", color: COLOR_KEYWORDS.pink },
    { title: "Action Items", color: COLOR_KEYWORDS.blue },
  ] as const;

  const operations: BoardToolCall[] = [
    {
      tool: "createFrame",
      args: {
        title: "Retrospective Board",
        x: spawnPoint.x,
        y: spawnPoint.y,
        width: 1020,
        height: 420,
      },
    },
  ];

  columns.forEach((column, index) => {
    operations.push({
      tool: "createStickyNote",
      args: {
        text: column.title,
        x: spawnPoint.x + 40 + index * RETRO_COLUMN_SPACING_X,
        y: spawnPoint.y + 72,
        color: column.color,
      },
    });
  });

  return {
    planned: true,
    intent: "create-retrospective-board",
    assistantMessage:
      "Created retrospective board with What Went Well, What Didn't, and Action Items columns.",
    plan: toPlan({
      id: "command.create-retrospective-board",
      name: "Create Retrospective Board",
      operations,
    }),
  };
}

/**
 * Handles plan create sticky.
 */
function planCreateSticky(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (
    !/\b(add|create)\b/.test(lower) ||
    !/\b(?:sticky(?:\s+note)?s?|notes?)\b/.test(lower)
  ) {
    return null;
  }

  const point =
    parseCoordinatePoint(input.message) ??
    getViewportAnchoredStickyOrigin({
      message: input.message,
      viewportBounds: input.viewportBounds,
      count: 1,
      columns: 1,
    }) ??
    getAutoSpawnPoint(input.boardState);
  const color = findColor(input.message) ?? COLOR_KEYWORDS.yellow;
  const text = parseStickyText(input.message);

  return {
    planned: true,
    intent: "create-sticky",
    assistantMessage: "Created sticky note.",
    plan: toPlan({
      id: "command.create-sticky",
      name: "Create Sticky Note",
      operations: [
        {
          tool: "createStickyNote",
          args: {
            text,
            x: point.x,
            y: point.y,
            color,
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan create sticky batch.
 */
function planCreateStickyBatch(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const batchClauses = splitStickyCreationClauses(input.message)
    .map((clause) => parseStickyBatchClause(clause))
    .filter((clause): clause is ParsedStickyBatchClause => clause !== null);
  if (batchClauses.length === 0) {
    return null;
  }

  const oversizedClause = batchClauses.find(
    (clause) => clause.count > MAX_STICKY_BATCH_COUNT,
  );
  if (oversizedClause) {
    return {
      planned: false,
      intent: "create-sticky-batch",
      assistantMessage: `Create up to ${MAX_STICKY_BATCH_COUNT} sticky notes per command.`,
    };
  }

  const operations: BoardToolCall[] = [];
  let previousClause: ParsedStickyBatchClause | null = null;
  const containerTarget = isAddToContainerCommand(input.message)
    ? resolveContainerTarget(input)
    : null;
  if (isAddToContainerCommand(input.message) && !containerTarget) {
    return {
      planned: false,
      intent: "create-sticky-batch",
      assistantMessage:
        "I could not find a clear frame/container. Select a frame, make sure only one visible frame/container exists, or pass coordinates to place stickies.",
    };
  }

  batchClauses.forEach((clause, index) => {
    const fallbackPoint =
      parseCoordinatePoint(clause.sourceText) ??
      (containerTarget
        ? resolveContainerStickyOrigin(
            containerTarget.object,
            input.message,
            {
              count: clause.count,
              columns: clause.columns,
              gapX: STICKY_GRID_SPACING_X,
              gapY: STICKY_GRID_SPACING_Y,
            },
          )
        : getViewportAnchoredStickyOrigin({
            message: clause.sourceText,
            viewportBounds: input.viewportBounds,
            count: clause.count,
            columns: clause.columns,
          }));

    let point = clause.point ?? fallbackPoint;
    if (!point) {
      point = getAutoSpawnPoint(input.boardState);
    }
    if (containerTarget && !parseCoordinatePoint(clause.sourceText)) {
      point = clampPointToFrameBounds(point, containerTarget.object);
    }

    if (index > 0 && !clause.hasExplicitPoint) {
      if (previousClause) {
        const lastPoint = previousClause.point ?? getAutoSpawnPoint(input.boardState);
        const lastSide = previousClause.side ?? null;

        if (lastSide === "left" || lastSide === "right") {
          point = {
            x: lastPoint.x,
            y: lastPoint.y + previousClause.clusterHeight + STICKY_GRID_SPACING_Y,
          };
        } else if (lastSide === "top" || lastSide === "bottom") {
          point = {
            x: lastPoint.x + previousClause.clusterWidth + STICKY_GRID_SPACING_X,
            y: lastPoint.y,
          };
        } else {
          point = {
            x: lastPoint.x + previousClause.clusterWidth + STICKY_GRID_SPACING_X,
            y: lastPoint.y,
          };
        }
      }
      if (containerTarget) {
        point = clampPointToFrameBounds(point, containerTarget.object);
      }
    }

    operations.push({
      tool: "createStickyBatch",
      args: {
        count: clause.count,
        color: clause.color,
        originX: point.x,
        originY: point.y,
        columns: clause.columns,
        gapX: STICKY_GRID_SPACING_X,
        gapY: STICKY_GRID_SPACING_Y,
        textPrefix: clause.textPrefix,
      },
    });

    previousClause = {
      ...clause,
      point,
      rows: clause.rows,
      clusterWidth: clause.clusterWidth,
      clusterHeight: clause.clusterHeight,
    };
  });

  return {
    planned: true,
    intent: "create-sticky-batch",
    assistantMessage: `Created ${batchClauses.length} sticky note requests.`,
    plan: toPlan({
      id: "command.create-sticky-batch",
      name: "Create Sticky Notes",
      operations,
    }),
  };
}

/**
 * Handles plan add SWOT section item.
 */
function planAddSwotSectionItem(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower)) {
    return null;
  }

  const targetSection = parseSwotSectionTarget(input.message);
  if (!targetSection) {
    return null;
  }

  const text = parseSwotItemText(input.message, targetSection);
  if (!text) {
    return {
      planned: false,
      intent: "add-swot-item",
      assistantMessage:
        "Add text for the SWOT item, for example: add a strength - \"our team\".",
    };
  }

  const placement = findSwotSectionPlacement({
    boardState: input.boardState,
    section: targetSection,
  });
  if (!placement) {
    return {
      planned: false,
      intent: "add-swot-item",
      assistantMessage:
        "Create a SWOT analysis first, then add strengths, weaknesses, opportunities, or threats.",
    };
  }

  const stickySize = DEFAULT_SIZES.sticky;
  const topLeft = clampObjectTopLeftToSection(
    placement.sectionBounds,
    stickySize,
    {
      x: placement.sectionBounds.left + 24,
      y: placement.sectionBounds.top + 24,
    },
  );
  const color = findColor(input.message) ?? SWOT_SECTION_STICKY_COLORS[targetSection];
  const label = targetSection.slice(0, -1);

  return {
    planned: true,
    intent: "add-swot-item",
    assistantMessage: `Added ${label} sticky note.`,
    plan: toPlan({
      id: "command.add-swot-item",
      name: "Add SWOT Item",
      operations: [
        {
          tool: "createStickyNote",
          args: {
            text,
            x: topLeft.x,
            y: topLeft.y,
            color,
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan create frame.
 */
function planCreateFrame(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower) || !/\bframe\b/.test(lower)) {
    return null;
  }

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const size = parseSize(input.message) ?? { width: 520, height: 340 };
  const titleMatch = input.message.match(
    /\b(?:called|named|title)\b\s+["“']?([^"”'\r\n]+?)(?:["”']|\s*$)/i,
  );
  const title = titleMatch?.[1]
    ? normalizeFrameTitle(titleMatch[1]) || "New frame"
    : "New frame";

  return {
    planned: true,
    intent: "create-frame",
    assistantMessage: "Created frame.",
    plan: toPlan({
      id: "command.create-frame",
      name: "Create Frame",
      operations: [
        {
          tool: "createFrame",
          args: {
            title: title.slice(0, 200),
            x: point.x,
            y: point.y,
            width: size.width,
            height: size.height,
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan create shape.
 */
function planCreateShape(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower)) {
    return null;
  }

  const shapeType = parseShapeType(input.message);
  if (!shapeType || shapeType === "sticky") {
    return null;
  }

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const size = parseSize(input.message) ?? DEFAULT_SIZES[shapeType];
  const color = findColor(input.message) ?? COLOR_KEYWORDS.blue;

  return {
    planned: true,
    intent: `create-${shapeType}`,
    assistantMessage: `Created ${shapeType} shape.`,
    plan: toPlan({
      id: `command.create-${shapeType}`,
      name: "Create Shape",
      operations: [
        {
          tool: "createShape",
          args: {
            type: shapeType,
            x: point.x,
            y: point.y,
            width: size.width,
            height: size.height,
            color,
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan move selected.
 */
function planMoveSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower) || !/\bselected\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage:
        "Select one or more objects first, then run the move command again.",
    };
  }
  if (selectedObjects.length > MAX_MOVE_OBJECTS) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage: `Move up to ${MAX_MOVE_OBJECTS} selected objects per command.`,
    };
  }

  const targetPoint = parseCoordinatePoint(input.message);
  const sideTarget = parseSideTarget(input.message);
  if (targetPoint) {
    return {
      planned: true,
      intent: "move-selected",
      assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
      plan: toPlan({
        id: "command.move-selected",
        name: "Move Selected Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: selectedObjects.map((objectItem) => objectItem.id),
              toPoint: {
                x: targetPoint.x,
                y: targetPoint.y,
              },
            },
          },
        ],
      }),
    };
  }

  if (sideTarget) {
    return {
      planned: true,
      intent: "move-selected",
      assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} to ${sideTarget} side.`,
      plan: toPlan({
        id: "command.move-selected",
        name: "Move Selected Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: selectedObjects.map((objectItem) => objectItem.id),
              toViewportSide: {
                side: sideTarget,
                ...(input.viewportBounds
                  ? { viewportBounds: input.viewportBounds }
                  : {}),
              },
            },
          },
        ],
      }),
    };
  }

  const delta = parseDirectionDelta(input.message);
  if (!delta) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage:
        "Specify where to move selected objects, for example: right by 120, or to 400, 300.",
    };
  }

  return {
    planned: true,
    intent: "move-selected",
    assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-selected",
      name: "Move Selected Objects",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            delta: {
              dx: delta.x,
              dy: delta.y,
            },
          },
        },
      ],
    }),
  };
}

/**
 * Parses move all type.
 */
function parseMoveAllType(message: string): BoardObjectToolKind | null {
  const match = message.match(
    /\b(?:(?:all|every|each|the)\b(?:\s+\w+){0,3}|\w+\s+){0,1}(sticky\s+notes|stickies|rectangles|circles|lines|triangles|stars|connectors)\b/i,
  );
  if (!match) {
    return null;
  }

  const noun = match[1].toLowerCase();
  if (noun === "sticky notes" || noun === "stickies") {
    return "sticky";
  }

  if (noun === "rectangles") {
    return "rect";
  }

  if (noun === "circles") {
    return "circle";
  }

  if (noun === "lines") {
    return "line";
  }

  if (noun === "triangles") {
    return "triangle";
  }

  if (noun === "stars") {
    return "star";
  }

  if (noun === "connectors") {
    return "connectorUndirected";
  }

  return null;
}

/**
 * Handles plan move all.
 */
function planMoveAll(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower)) {
    return null;
  }

  const objectType = parseMoveAllType(input.message);
  if (!objectType) {
    return null;
  }

  const colorFilter = findColor(input.message);
  const candidates = input.boardState.filter((objectItem) => {
    if (objectItem.type !== objectType) {
      return false;
    }

    if (!colorFilter) {
      return true;
    }

    return objectItem.color.toLowerCase() === colorFilter.toLowerCase();
  });

  if (candidates.length === 0) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage: "No matching objects found to move.",
    };
  }
  if (candidates.length > MAX_MOVE_OBJECTS) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage: `Move up to ${MAX_MOVE_OBJECTS} objects per command.`,
    };
  }

  const targetPoint = parseCoordinatePoint(input.message);
  const sideTarget = parseSideTarget(input.message);

  if (targetPoint) {
    return {
      planned: true,
      intent: "move-all",
      assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"}.`,
      plan: toPlan({
        id: "command.move-all",
        name: "Move Matching Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: candidates.map((objectItem) => objectItem.id),
              toPoint: {
                x: targetPoint.x,
                y: targetPoint.y,
              },
            },
          },
        ],
      }),
    };
  }

  if (sideTarget) {
    return {
      planned: true,
      intent: "move-all",
      assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"} to ${sideTarget} side.`,
      plan: toPlan({
        id: "command.move-all",
        name: "Move Matching Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: candidates.map((objectItem) => objectItem.id),
              toViewportSide: {
                side: sideTarget,
                ...(input.viewportBounds
                  ? { viewportBounds: input.viewportBounds }
                  : {}),
              },
            },
          },
        ],
      }),
    };
  }

  const delta = parseDirectionDelta(input.message);
  if (!delta) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage:
        "Specify a move direction or target position for matching objects.",
    };
  }

  return {
    planned: true,
    intent: "move-all",
    assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-all",
      name: "Move Matching Objects",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: candidates.map((objectItem) => objectItem.id),
            delta: {
              dx: delta.x,
              dy: delta.y,
            },
          },
        },
      ],
    }),
  };
}

/**
 * Returns whether fit-frame command is true.
 */
function isFitFrameToContentsCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bfit\b[\w\s]{0,20}\bframe\b[\w\s]{0,20}\bcontents?\b/.test(lower) ||
    /\bresize\b[\w\s]{0,20}\bframe\b[\w\s]{0,20}\bfit\b[\w\s]{0,20}\bcontents?\b/.test(
      lower,
    )
  );
}

/**
 * Finds frame candidate id.
 */
function findFrameCandidateId(input: PlannerInput): string | null {
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  const selectedFrames = selectedObjects.filter(
    (objectItem) =>
      objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  if (selectedFrames.length > 0) {
    return selectedFrames[0].id;
  }

  const frames = input.boardState.filter(
    (objectItem) =>
      objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  if (frames.length === 1) {
    return frames[0].id;
  }

  return null;
}

/**
 * Handles plan fit frame to contents.
 */
function planFitFrameToContents(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isFitFrameToContentsCommand(input.message)) {
    return null;
  }

  const frameId = findFrameCandidateId(input);
  if (!frameId) {
    return {
      planned: false,
      intent: "fit-frame-to-contents",
      assistantMessage:
        "Select a frame first, then run resize frame to fit contents.",
    };
  }

  return {
    planned: true,
    intent: "fit-frame-to-contents",
    assistantMessage: "Resized frame to fit its contents.",
    plan: toPlan({
      id: "command.fit-frame-to-contents",
      name: "Fit Frame To Contents",
      operations: [
        {
          tool: "fitFrameToContents",
          args: {
            frameId,
            padding: parsePadding(input.message) ?? DEFAULT_FRAME_FIT_PADDING,
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan resize selected.
 */
function planResizeSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bresize\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage: "Select one or more objects first, then run resize.",
    };
  }

  const size = parseSize(input.message);
  if (!size) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage:
        "Specify dimensions, for example: resize selected to 220 by 140.",
    };
  }

  return {
    planned: true,
    intent: "resize-selected",
    assistantMessage: `Resized ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.resize-selected",
      name: "Resize Selected Objects",
      operations: selectedObjects.map((objectItem) => ({
        tool: "resizeObject",
        args: {
          objectId: objectItem.id,
          width: size.width,
          height: size.height,
        },
      })),
    }),
  };
}

/**
 * Handles plan change color selected.
 */
function planChangeColorSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(change|set|make)\b/.test(lower) || !/\bcolor\b/.test(lower)) {
    return null;
  }

  const color = findColor(input.message);
  if (!color) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage:
        "I could not detect a supported color name in your command.",
    };
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage:
        "Select one or more objects first, then run color change.",
    };
  }

  return {
    planned: true,
    intent: "change-color",
    assistantMessage: `Changed color for ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.change-color",
      name: "Change Selected Object Color",
      operations: selectedObjects.map((objectItem) => ({
        tool: "changeColor",
        args: {
          objectId: objectItem.id,
          color,
        },
      })),
    }),
  };
}

/**
 * Handles plan update selected text.
 */
function planUpdateSelectedText(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(update|set|change)\b/.test(lower) || !/\btext\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage: "Select one object first, then run text update.",
    };
  }

  const textMatch = input.message.match(/\bto\b\s+["“']?(.+?)["”']?$/i);
  const nextText = textMatch?.[1]?.trim();
  if (!nextText) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage:
        "Specify the new text, for example: update text to Q2 priorities.",
    };
  }

  const target = selectedObjects[0];
  return {
    planned: true,
    intent: "update-text",
    assistantMessage: "Updated selected object text.",
    plan: toPlan({
      id: "command.update-text",
      name: "Update Selected Text",
      operations: [
        {
          tool: "updateText",
          args: {
            objectId: target.id,
            newText: nextText.slice(0, 1_000),
          },
        },
      ],
    }),
  };
}

/**
 * Handles plan deterministic command.
 */
export function planDeterministicCommand(
  input: PlannerInput,
): DeterministicCommandPlanResult {
  const planners = [
    planClearBoard,
    planUnselectObjects,
    planSelectAllObjects,
    planSelectVisibleObjects,
    planDeleteSelected,
    planArrangeGrid,
    planAlignSelected,
    planDistributeSelected,
    planSummarizeSource,
    planExtractActionItems,
    planCreateStickyGrid,
    planCreateSwotTemplate,
    planAddSwotSectionItem,
    planCreateJourneyMap,
    planCreateRetrospectiveBoard,
    planCreateStickyBatch,
    planCreateSticky,
    planCreateFrame,
    planCreateShape,
    planMoveSelected,
    planMoveAll,
    planFitFrameToContents,
    planResizeSelected,
    planChangeColorSelected,
    planUpdateSelectedText,
  ];

  for (const planner of planners) {
    const result = planner(input);
    if (result) {
      return result;
    }
  }

  return {
    planned: false,
    intent: "unsupported-command",
    assistantMessage:
      "I could not map that command yet. Try creating stickies/shapes/frames, adding SWOT items (strength/weakness/opportunity/threat), arranging or aligning or distributing selected objects, moving object groups, resizing selected or fitting a frame to contents, summarizing notes, extracting action items, deleting selected, clearing the board, changing selected color, or creating SWOT, retrospective, and journey-map templates.",
  };
}
