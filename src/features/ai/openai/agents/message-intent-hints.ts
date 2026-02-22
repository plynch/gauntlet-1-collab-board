import { MAX_AI_CREATED_OBJECTS_PER_COMMAND } from "@/features/ai/guardrails";

export type StickyLayoutHints = {
  columns?: number;
  gapX?: number;
  gapY?: number;
  rowRequested: boolean;
  stackRequested: boolean;
};

export type OpenAiMessageIntentHints = {
  stickyCreateRequest: boolean;
  stickyColorHint: string | null;
  createRequest: boolean;
  requestedCreateCount: number | null;
  stickyRequestedCount: number | null;
  shapeRequestedCount: number | null;
  createLimitExceeded: boolean;
  stickyLayoutHints: StickyLayoutHints;
  viewportLayoutRequested: boolean;
  centerLayoutRequested?: boolean;
};

const MAX_COUNT_HINT = 20_000;
const MAX_LAYOUT_COLUMNS_HINT = 10;
const MAX_LAYOUT_GAP_HINT = 400;

const COLOR_HINTS = [
  ["yellow", "#fde68a"],
  ["orange", "#fdba74"],
  ["red", "#fca5a5"],
  ["pink", "#f9a8d4"],
  ["purple", "#c4b5fd"],
  ["blue", "#93c5fd"],
  ["teal", "#99f6e4"],
  ["green", "#86efac"],
  ["gray", "#d1d5db"],
  ["grey", "#d1d5db"],
  ["tan", "#d2b48c"],
] as const;

const CREATE_VERB_REGEX = /\b(create|add|make|build|generate|spawn|set\s+up)\b/i;
const DESTRUCTIVE_OR_EDIT_VERB_REGEX =
  /\b(change|update|edit|delete|remove|move|resize|recolor|recolour)\b/i;
const CREATE_COUNT_NOUN_PATTERN =
  "stick(?:y|ies)|notes?|rectangles?|rects?|circles?|lines?|triangles?|stars?|shapes?|frames?|containers?|connectors?|objects?";
const STICKY_NOUN_PATTERN = "stick(?:y|ies)|notes?";
const SHAPE_NOUN_PATTERN =
  "rectangles?|rects?|circles?|lines?|triangles?|stars?|shapes?";

function toPositiveInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Math.min(parsed, MAX_COUNT_HINT);
}

function toBoundedLayoutInteger(
  value: string | undefined,
  maximum: number,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.min(maximum, Math.floor(parsed)));
}

function sumNounCounts(input: string, nounPattern: string): number {
  const regex = new RegExp(
    `\\b(\\d{1,5})\\s+(?:[a-z-]+\\s+){0,3}?(?:${nounPattern})\\b`,
    "gi",
  );
  let total = 0;
  for (const match of input.matchAll(regex)) {
    const count = toPositiveInteger(match[1]);
    if (count) {
      total += count;
    }
  }
  return total;
}

function sumGridCounts(input: string, nounPattern: string): number {
  const regex = new RegExp(
    `\\b(\\d{1,3})\\s*(?:x|by)\\s*(\\d{1,3})\\b(?=[^\\n]{0,48}\\b(?:${nounPattern})\\b)`,
    "gi",
  );
  let total = 0;
  for (const match of input.matchAll(regex)) {
    const left = toPositiveInteger(match[1]);
    const right = toPositiveInteger(match[2]);
    if (left && right) {
      total += left * right;
    }
  }
  return total;
}

function parseRequestedCreateCount(
  normalized: string,
  nounPattern: string,
): number | null {
  const explicitCountTotal =
    sumGridCounts(normalized, nounPattern) + sumNounCounts(normalized, nounPattern);
  if (explicitCountTotal > 0) {
    return explicitCountTotal;
  }

  const directCreateCountMatch = normalized.match(
    /\b(?:create|add|make|build|generate|spawn)\s+(\d{1,5})\b/i,
  );
  if (!directCreateCountMatch) {
    return null;
  }
  return toPositiveInteger(directCreateCountMatch[1]);
}

function parseStickyLayoutHints(normalized: string): StickyLayoutHints {
  const columnsMatch = normalized.match(/\b(\d{1,2})\s+columns?\b/i);
  const gapXYMatch = normalized.match(/\bgap\s*x\s*(\d{1,3})\s*y\s*(\d{1,3})\b/i);
  const gapSingleMatch = normalized.match(/\bgap\s*(\d{1,3})\b/i);

  const columns = toBoundedLayoutInteger(
    columnsMatch?.[1],
    MAX_LAYOUT_COLUMNS_HINT,
  );
  const rowRequested =
    /\bin\s+a\s+row\b/i.test(normalized) ||
    /\bsingle\s+row\b/i.test(normalized) ||
    /\bhorizontal(?:ly)?\b/i.test(normalized);
  const stackRequested =
    /\bstack(?:ed|ing)?\b/i.test(normalized) ||
    /\bvertical(?:ly)?\b/i.test(normalized);

  let gapX = toBoundedLayoutInteger(gapXYMatch?.[1], MAX_LAYOUT_GAP_HINT);
  let gapY = toBoundedLayoutInteger(gapXYMatch?.[2], MAX_LAYOUT_GAP_HINT);

  if (gapX === undefined || gapY === undefined) {
    const singleGap = toBoundedLayoutInteger(
      gapSingleMatch?.[1],
      MAX_LAYOUT_GAP_HINT,
    );
    if (singleGap !== undefined) {
      gapX = gapX ?? singleGap;
      gapY = gapY ?? singleGap;
    }
  }

  return {
    ...(typeof columns === "number" ? { columns } : {}),
    ...(typeof gapX === "number" ? { gapX } : {}),
    ...(typeof gapY === "number" ? { gapY } : {}),
    rowRequested,
    stackRequested,
  };
}

function isViewportLayoutRequested(normalized: string): boolean {
  return (
    /\bacross\b[\w\s]{0,24}\b(screen|viewport|canvas|view)\b/i.test(normalized) ||
    /\bto\s+the\s+edges?\b/i.test(normalized) ||
    /\bfull\s+(width|height)\b/i.test(normalized)
  );
}

function isCenterLayoutRequested(normalized: string): boolean {
  return (
    /\b(in|at)\s+the\s+(middle|center|centre)\b/i.test(normalized) ||
    /\b(center|centre)(?:ed)?\b/i.test(normalized)
  );
}

export function parseMessageIntentHints(message: string): OpenAiMessageIntentHints {
  const normalized = message.trim().toLowerCase();
  const stickyColorHint =
    COLOR_HINTS.find(([colorName]) =>
      new RegExp(`\\b${colorName}\\b`, "i").test(normalized),
    )?.[1] ?? null;
  const stickyMentioned = /\bstick(?:y|ies)\b|\bnotes?\b/.test(normalized);
  const createVerbMentioned = CREATE_VERB_REGEX.test(normalized);
  const destructiveOrEditVerbMentioned =
    DESTRUCTIVE_OR_EDIT_VERB_REGEX.test(normalized);
  const createRequest = createVerbMentioned;
  const stickyRequestedCount = createVerbMentioned
    ? parseRequestedCreateCount(normalized, STICKY_NOUN_PATTERN)
    : null;
  const shapeRequestedCount = createVerbMentioned
    ? parseRequestedCreateCount(normalized, SHAPE_NOUN_PATTERN)
    : null;
  const requestedCreateCount = createVerbMentioned
    ? parseRequestedCreateCount(normalized, CREATE_COUNT_NOUN_PATTERN)
    : null;
  const createLimitExceeded =
    typeof requestedCreateCount === "number" &&
    requestedCreateCount > MAX_AI_CREATED_OBJECTS_PER_COMMAND;

  return {
    stickyCreateRequest:
      stickyMentioned &&
      createVerbMentioned &&
      !destructiveOrEditVerbMentioned,
    stickyColorHint,
    createRequest,
    requestedCreateCount,
    stickyRequestedCount,
    shapeRequestedCount,
    createLimitExceeded,
    stickyLayoutHints: parseStickyLayoutHints(normalized),
    viewportLayoutRequested: isViewportLayoutRequested(normalized),
    centerLayoutRequested: isCenterLayoutRequested(normalized),
  };
}
