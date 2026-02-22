import type { BoardObjectSnapshot } from "@/features/ai/types";
import type { Point } from "@/features/ai/commands/deterministic-command-planner-constants";
import { normalizeMessage } from "@/features/ai/commands/deterministic-command-planner-base-utils";

export function parseGridGap(message: string): {
  gapX?: number;
  gapY?: number;
} | null {
  const explicitGapMatch = message.match(
    /\bgap\s*x\s*(-?\d+(?:\.\d+)?)\s*y\s*(-?\d+(?:\.\d+)?)/i,
  );
  if (explicitGapMatch) {
    return {
      gapX: Number(explicitGapMatch[1]),
      gapY: Number(explicitGapMatch[2]),
    };
  }

  const gapXMatch = message.match(/\bgap\s*x\s*(-?\d+(?:\.\d+)?)/i);
  const gapYMatch = message.match(/\bgap\s*y\s*(-?\d+(?:\.\d+)?)/i);
  if (gapXMatch || gapYMatch) {
    return {
      gapX: gapXMatch ? Number(gapXMatch[1]) : undefined,
      gapY: gapYMatch ? Number(gapYMatch[1]) : undefined,
    };
  }

  const uniformGapMatch = message.match(/\bgap\s*(-?\d+(?:\.\d+)?)/i);
  if (!uniformGapMatch) {
    return null;
  }

  const value = Number(uniformGapMatch[1]);
  return { gapX: value, gapY: value };
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
