import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  TemplatePlan,
} from "@/features/ai/types";

type PlannerInput = {
  message: string;
  boardState: BoardObjectSnapshot[];
  selectedObjectIds: string[];
};

export type DeterministicCommandPlanResult =
  | {
      planned: true;
      intent: string;
      assistantMessage: string;
      plan: TemplatePlan;
    }
  | {
      planned: false;
      intent: string;
      assistantMessage: string;
    };

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

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
 * Gets board bounds.
 */
function getBoardBounds(boardState: BoardObjectSnapshot[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
  if (boardState.length === 0) {
    return null;
  }

  return {
    left: Math.min(...boardState.map((objectItem) => objectItem.x)),
    right: Math.max(
      ...boardState.map((objectItem) => objectItem.x + objectItem.width),
    ),
    top: Math.min(...boardState.map((objectItem) => objectItem.y)),
    bottom: Math.max(
      ...boardState.map((objectItem) => objectItem.y + objectItem.height),
    ),
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
    !/\bstick(?:y|ies)(?:\s+notes?)?\b/.test(lower) ||
    /\bgrid\b/.test(lower)
  ) {
    return null;
  }

  const countMatch = message.match(
    /\b(\d+)\s+(?:\w+\s+){0,2}stick(?:y|ies)(?:\s+notes?)?\b/i,
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
    /\bremove\s+all\s+shapes\b/.test(lower)
  );
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
    /\b(delete|remove|clear)\b[\w\s]*\bselected\b/.test(lower) ||
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

  const operations: BoardToolCall[] = [];
  for (let row = 0; row < dimensions.rows; row += 1) {
    for (let column = 0; column < dimensions.columns; column += 1) {
      const index = row * dimensions.columns + column;
      const baseText = textSeed
        ? `${textSeed} ${index + 1}`
        : `Sticky ${index + 1}`;
      operations.push({
        tool: "createStickyNote",
        args: {
          text: baseText.slice(0, 1_000),
          x: point.x + column * STICKY_GRID_SPACING_X,
          y: point.y + row * STICKY_GRID_SPACING_Y,
          color,
        },
      });
    }
  }

  return {
    planned: true,
    intent: "create-sticky-grid",
    assistantMessage: `Created ${dimensions.rows}x${dimensions.columns} sticky grid (${total} notes).`,
    plan: toPlan({
      id: "command.create-sticky-grid",
      name: "Create Sticky Note Grid",
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
    !/\bsticky(?:\s+note)?s?\b/.test(lower)
  ) {
    return null;
  }

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
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
  const count = parseStickyBatchCount(input.message);
  if (!count) {
    return null;
  }

  if (count > MAX_STICKY_BATCH_COUNT) {
    return {
      planned: false,
      intent: "create-sticky-batch",
      assistantMessage: `Create up to ${MAX_STICKY_BATCH_COUNT} sticky notes per command.`,
    };
  }

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const color = findColor(input.message) ?? COLOR_KEYWORDS.yellow;
  const hasExplicitText = /\b(?:that says|saying|with text|text)\b/i.test(
    input.message,
  );
  const textSeed = hasExplicitText ? parseStickyText(input.message) : "Sticky";
  const columns = Math.min(STICKY_BATCH_DEFAULT_COLUMNS, count);

  const operations: BoardToolCall[] = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    operations.push({
      tool: "createStickyNote",
      args: {
        text: `${textSeed} ${index + 1}`.slice(0, 1_000),
        x: point.x + column * STICKY_GRID_SPACING_X,
        y: point.y + row * STICKY_GRID_SPACING_Y,
        color,
      },
    });
  }

  return {
    planned: true,
    intent: "create-sticky-batch",
    assistantMessage: `Created ${count} sticky notes.`,
    plan: toPlan({
      id: "command.create-sticky-batch",
      name: "Create Sticky Notes",
      operations,
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
    /\b(?:called|named|title)\b\s+["“']?(.+?)["”']?$/i,
  );
  const title = titleMatch?.[1]?.trim() || "New frame";

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

  const targetPoint = parseCoordinatePoint(input.message);
  const operations: BoardToolCall[] = [];

  if (targetPoint) {
    const anchor = selectedObjects[0];
    const dx = targetPoint.x - anchor.x;
    const dy = targetPoint.y - anchor.y;

    selectedObjects.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + dx,
          y: objectItem.y + dy,
        },
      });
    });
  } else {
    const delta = parseDirectionDelta(input.message);
    if (!delta) {
      return {
        planned: false,
        intent: "move-selected",
        assistantMessage:
          "Specify where to move selected objects, for example: right by 120, or to 400, 300.",
      };
    }

    selectedObjects.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + delta.x,
          y: objectItem.y + delta.y,
        },
      });
    });
  }

  return {
    planned: true,
    intent: "move-selected",
    assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-selected",
      name: "Move Selected Objects",
      operations,
    }),
  };
}

/**
 * Parses move all type.
 */
function parseMoveAllType(message: string): BoardObjectToolKind | null {
  const match = message.match(
    /\ball\b(?:\s+\w+)?\s+(sticky(?:\s+notes?)?|rectangles?|circles?|lines?|triangles?|stars?|connectors?)\b/i,
  );
  if (!match) {
    return null;
  }

  if (/connectors?/i.test(match[1])) {
    return "connectorUndirected";
  }

  return parseShapeType(match[1]);
}

/**
 * Handles plan move all.
 */
function planMoveAll(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower) || !/\ball\b/.test(lower)) {
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

  const targetPoint = parseCoordinatePoint(input.message);
  const operations: BoardToolCall[] = [];

  if (targetPoint) {
    const anchor = candidates[0];
    const dx = targetPoint.x - anchor.x;
    const dy = targetPoint.y - anchor.y;

    candidates.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + dx,
          y: objectItem.y + dy,
        },
      });
    });
  } else {
    const delta = parseDirectionDelta(input.message);
    if (!delta) {
      return {
        planned: false,
        intent: "move-all",
        assistantMessage:
          "Specify a move direction or target position for matching objects.",
      };
    }

    candidates.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + delta.x,
          y: objectItem.y + delta.y,
        },
      });
    });
  }

  return {
    planned: true,
    intent: "move-all",
    assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-all",
      name: "Move Matching Objects",
      operations,
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
    planDeleteSelected,
    planArrangeGrid,
    planCreateStickyGrid,
    planCreateStickyBatch,
    planCreateSticky,
    planCreateFrame,
    planCreateShape,
    planMoveSelected,
    planMoveAll,
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
      "I could not map that command yet. Try creating shapes/stickies, arranging selected objects in a grid, moving/resizing selected objects, deleting selected, clearing the board, changing selected color, or creating a SWOT template.",
  };
}
