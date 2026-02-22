import type { Point, Size } from "@/features/ai/commands/deterministic-command-planner-constants";

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
