import type { BoardObjectSnapshot } from "@/features/ai/types";
import {
  COLOR_KEYWORDS,
  MAX_ACTION_ITEM_CANDIDATES,
  MAX_IMPLICIT_LAYOUT_OBJECTS,
  type Point,
  type Size,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

export function getSelectedObjects(
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

export function isLayoutEligibleObject(objectItem: BoardObjectSnapshot): boolean {
  return (
    objectItem.type !== "gridContainer" &&
    objectItem.type !== "connectorUndirected" &&
    objectItem.type !== "connectorArrow" &&
    objectItem.type !== "connectorBidirectional"
  );
}

export function resolveLayoutTargets(
  input: PlannerInput,
  minimumCount: number,
): {
  objects: BoardObjectSnapshot[];
  source: "selected" | "implicit" | "none";
  tooMany: boolean;
} {
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  ).filter(isLayoutEligibleObject);
  if (selectedObjects.length > 0) {
    return {
      objects: selectedObjects,
      source: "selected",
      tooMany: false,
    };
  }

  const lower = normalizeMessage(input.message);
  if (/\bselected\b/.test(lower)) {
    return {
      objects: [],
      source: "none",
      tooMany: false,
    };
  }

  const hasImplicitReference =
    /\b(these|them|those|elements?|objects?|notes?|stick(?:y|ies)|shapes?)\b/.test(
      lower,
    ) ||
    /\b(arrange|organize|organise|layout|lay\s*out|distribute|space)\b/.test(
      lower,
    );
  if (!hasImplicitReference) {
    return {
      objects: [],
      source: "none",
      tooMany: false,
    };
  }

  let candidates = input.boardState.filter(isLayoutEligibleObject);
  if (/\b(notes?|stick(?:y|ies))\b/.test(lower)) {
    candidates = candidates.filter((objectItem) => objectItem.type === "sticky");
  } else if (
    /\b(shapes?|rectangles?|rects?|circles?|lines?|triangles?|stars?)\b/.test(
      lower,
    )
  ) {
    candidates = candidates.filter((objectItem) =>
      objectItem.type === "rect" ||
      objectItem.type === "circle" ||
      objectItem.type === "triangle" ||
      objectItem.type === "star" ||
      objectItem.type === "line",
    );
  }

  if (candidates.length > MAX_IMPLICIT_LAYOUT_OBJECTS) {
    return {
      objects: [],
      source: "implicit",
      tooMany: true,
    };
  }

  if (candidates.length < minimumCount) {
    return {
      objects: [],
      source: "implicit",
      tooMany: false,
    };
  }

  return {
    objects: candidates,
    source: "implicit",
    tooMany: false,
  };
}

export function getIntersectionBounds(
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

export function hasUsableText(objectItem: BoardObjectSnapshot): boolean {
  return objectItem.text.trim().length > 0;
}

export function getTextObjects(
  boardState: BoardObjectSnapshot[],
): BoardObjectSnapshot[] {
  return boardState.filter(hasUsableText);
}

export function toTextSnippet(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength).trimEnd()}...`;
}

export function getAnalysisSource(input: PlannerInput): {
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

export function parseActionItemCandidates(
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

export function findColor(message: string): string | null {
  const lower = normalizeMessage(message);
  const key = Object.keys(COLOR_KEYWORDS).find((colorName) =>
    new RegExp(`\\b${colorName}\\b`, "i").test(lower),
  );
  return key ? COLOR_KEYWORDS[key] : null;
}

export function parseCoordinatePoint(message: string): Point | null {
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

export function parseSize(message: string): Size | null {
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

export function parsePadding(message: string): number | null {
  const paddingMatch = message.match(/\bpadding\s*(-?\d+(?:\.\d+)?)\b/i);
  if (!paddingMatch) {
    return null;
  }

  return Math.max(0, Number(paddingMatch[1]));
}

export function toPositiveInteger(value: string): number {
  return Math.max(1, Math.floor(Number(value)));
}

export function parseGridDimensions(message: string): {
  rows: number;
  columns: number;
} | null {
  const dimsMatch = message.match(/\b(\d+)\s*(?:x|by)\s*(\d+)\b/i);
  if (!dimsMatch) {
    return null;
  }

  return {
    rows: toPositiveInteger(dimsMatch[1]),
    columns: toPositiveInteger(dimsMatch[2]),
  };
}

export function parseGridColumns(message: string): number | null {
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

export function parseJourneyStageCount(message: string): number | null {
  const stageMatch = message.match(/\b(\d+)\s*(?:-|\s)?stages?\b/i);
  if (!stageMatch) {
    return null;
  }

  return toPositiveInteger(stageMatch[1]);
}
