import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  TemplatePlan
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
  black: "#1f2937"
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
  star: { width: 180, height: 180 }
};

function normalizeMessage(message: string): string {
  return message.trim().toLowerCase();
}

function getSelectedObjects(
  boardState: BoardObjectSnapshot[],
  selectedIds: string[]
): BoardObjectSnapshot[] {
  const byId = new Map(boardState.map((objectItem) => [objectItem.id, objectItem]));
  return selectedIds
    .map((objectId) => byId.get(objectId))
    .filter((objectItem): objectItem is BoardObjectSnapshot => Boolean(objectItem));
}

function findColor(message: string): string | null {
  const lower = normalizeMessage(message);
  const key = Object.keys(COLOR_KEYWORDS).find((colorName) =>
    new RegExp(`\\b${colorName}\\b`, "i").test(lower)
  );
  return key ? COLOR_KEYWORDS[key] : null;
}

function parseCoordinatePoint(message: string): Point | null {
  const atMatch = message.match(
    /\b(?:at|to)\s*(?:position\s*)?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i
  );
  if (!atMatch) {
    return null;
  }

  return {
    x: Number(atMatch[1]),
    y: Number(atMatch[2])
  };
}

function parseSize(message: string): Size | null {
  const sizeMatch = message.match(
    /\b(?:size|to)\s*(\d+(?:\.\d+)?)\s*(?:x|by)\s*(\d+(?:\.\d+)?)/i
  );
  if (!sizeMatch) {
    return null;
  }

  return {
    width: Math.max(1, Number(sizeMatch[1])),
    height: Math.max(1, Number(sizeMatch[2]))
  };
}

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
    right: Math.max(...boardState.map((objectItem) => objectItem.x + objectItem.width)),
    top: Math.min(...boardState.map((objectItem) => objectItem.y)),
    bottom: Math.max(...boardState.map((objectItem) => objectItem.y + objectItem.height))
  };
}

function getAutoSpawnPoint(boardState: BoardObjectSnapshot[]): Point {
  const bounds = getBoardBounds(boardState);
  if (!bounds) {
    return { x: 160, y: 120 };
  }

  return {
    x: bounds.right + 100,
    y: bounds.top
  };
}

function parseDirectionDelta(message: string): Point | null {
  const match = message.match(
    /\b(right|left|up|down)\b(?:\s+by\s+(-?\d+(?:\.\d+)?))?/i
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

function parseStickyText(message: string): string {
  const textMatch = message.match(
    /\b(?:that says|saying|with text|text)\b\s+["“']?(.+?)["”']?$/i
  );
  if (!textMatch) {
    return "New sticky note";
  }

  const value = textMatch[1].trim();
  return value.length > 0 ? value.slice(0, 1_000) : "New sticky note";
}

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

function toPlan(options: {
  id: string;
  name: string;
  operations: BoardToolCall[];
}): TemplatePlan {
  return {
    templateId: options.id,
    templateName: options.name,
    operations: options.operations
  };
}

function isClearBoardCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bclear(?:\s+the)?\s+board\b/.test(lower) ||
    /\bdelete\s+all\s+shapes\b/.test(lower) ||
    /\bremove\s+all\s+shapes\b/.test(lower)
  );
}

function planClearBoard(input: PlannerInput): DeterministicCommandPlanResult | null {
  if (!isClearBoardCommand(input.message)) {
    return null;
  }

  if (input.boardState.length === 0) {
    return {
      planned: false,
      intent: "clear-board-empty",
      assistantMessage: "Board is already empty."
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
            objectIds: input.boardState.map((objectItem) => objectItem.id)
          }
        }
      ]
    })
  };
}

function isDeleteSelectedCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(delete|remove|clear)\b[\w\s]*\bselected\b/.test(lower) ||
    /\bdelete\s+selection\b/.test(lower) ||
    /\bremove\s+selection\b/.test(lower)
  );
}

function planDeleteSelected(input: PlannerInput): DeterministicCommandPlanResult | null {
  if (!isDeleteSelectedCommand(input.message)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(input.boardState, input.selectedObjectIds);
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "delete-selected",
      assistantMessage: "Select one or more objects first, then run delete selected."
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
            objectIds: selectedObjects.map((objectItem) => objectItem.id)
          }
        }
      ]
    })
  };
}

function planCreateSticky(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower) || !/\bsticky(?:\s+note)?s?\b/.test(lower)) {
    return null;
  }

  const point = parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
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
            color
          }
        }
      ]
    })
  };
}

function planCreateFrame(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower) || !/\bframe\b/.test(lower)) {
    return null;
  }

  const point = parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const size = parseSize(input.message) ?? { width: 520, height: 340 };
  const titleMatch = input.message.match(/\b(?:called|named|title)\b\s+["“']?(.+?)["”']?$/i);
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
            height: size.height
          }
        }
      ]
    })
  };
}

function planCreateShape(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower)) {
    return null;
  }

  const shapeType = parseShapeType(input.message);
  if (!shapeType || shapeType === "sticky") {
    return null;
  }

  const point = parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
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
            color
          }
        }
      ]
    })
  };
}

function planMoveSelected(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower) || !/\bselected\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(input.boardState, input.selectedObjectIds);
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage: "Select one or more objects first, then run the move command again."
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
          y: objectItem.y + dy
        }
      });
    });
  } else {
    const delta = parseDirectionDelta(input.message);
    if (!delta) {
      return {
        planned: false,
        intent: "move-selected",
        assistantMessage:
          "Specify where to move selected objects, for example: right by 120, or to 400, 300."
      };
    }

    selectedObjects.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + delta.x,
          y: objectItem.y + delta.y
        }
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
      operations
    })
  };
}

function parseMoveAllType(message: string): BoardObjectToolKind | null {
  const match = message.match(
    /\ball\b(?:\s+\w+)?\s+(sticky(?:\s+notes?)?|rectangles?|circles?|lines?|triangles?|stars?|connectors?)\b/i
  );
  if (!match) {
    return null;
  }

  if (/connectors?/i.test(match[1])) {
    return "connectorUndirected";
  }

  return parseShapeType(match[1]);
}

function planMoveAll(input: PlannerInput): DeterministicCommandPlanResult | null {
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
      assistantMessage: "No matching objects found to move."
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
          y: objectItem.y + dy
        }
      });
    });
  } else {
    const delta = parseDirectionDelta(input.message);
    if (!delta) {
      return {
        planned: false,
        intent: "move-all",
        assistantMessage: "Specify a move direction or target position for matching objects."
      };
    }

    candidates.forEach((objectItem) => {
      operations.push({
        tool: "moveObject",
        args: {
          objectId: objectItem.id,
          x: objectItem.x + delta.x,
          y: objectItem.y + delta.y
        }
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
      operations
    })
  };
}

function planResizeSelected(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bresize\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(input.boardState, input.selectedObjectIds);
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage: "Select one or more objects first, then run resize."
    };
  }

  const size = parseSize(input.message);
  if (!size) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage: "Specify dimensions, for example: resize selected to 220 by 140."
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
          height: size.height
        }
      }))
    })
  };
}

function planChangeColorSelected(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(change|set|make)\b/.test(lower) || !/\bcolor\b/.test(lower)) {
    return null;
  }

  const color = findColor(input.message);
  if (!color) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage: "I could not detect a supported color name in your command."
    };
  }

  const selectedObjects = getSelectedObjects(input.boardState, input.selectedObjectIds);
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage: "Select one or more objects first, then run color change."
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
          color
        }
      }))
    })
  };
}

function planUpdateSelectedText(input: PlannerInput): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(update|set|change)\b/.test(lower) || !/\btext\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(input.boardState, input.selectedObjectIds);
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage: "Select one object first, then run text update."
    };
  }

  const textMatch = input.message.match(/\bto\b\s+["“']?(.+?)["”']?$/i);
  const nextText = textMatch?.[1]?.trim();
  if (!nextText) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage: "Specify the new text, for example: update text to Q2 priorities."
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
            newText: nextText.slice(0, 1_000)
          }
        }
      ]
    })
  };
}

export function planDeterministicCommand(
  input: PlannerInput
): DeterministicCommandPlanResult {
  const planners = [
    planClearBoard,
    planDeleteSelected,
    planCreateSticky,
    planCreateFrame,
    planCreateShape,
    planMoveSelected,
    planMoveAll,
    planResizeSelected,
    planChangeColorSelected,
    planUpdateSelectedText
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
      "I could not map that command yet. Try creating shapes/stickies, move/resize selected objects, delete selected, clear the board, change selected color, or create a SWOT template."
  };
}
