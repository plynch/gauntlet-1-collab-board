import type { BoardObjectSnapshot } from "@/features/ai/types";
import {
  STICKY_BATCH_TOOL_SIZE,
  STICKY_FRAME_PADDING,
  type Point,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import {
  escapeRegex,
  getIntersectionBounds,
  getSelectedObjects,
  normalizeMessage,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";

export type FrameTarget = {
  id: string;
  object: BoardObjectSnapshot;
  reason: "selected" | "visible" | "single-frame";
};

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
    return { x: fallbackX, y: fallbackY };
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
