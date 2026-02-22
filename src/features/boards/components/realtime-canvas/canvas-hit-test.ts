import type { BoardObject, BoardObjectKind } from "@/features/boards/types";

type Point = {
  x: number;
  y: number;
};

export type CanvasHitTarget =
  | {
      kind: "object";
      objectId: string;
    }
  | {
      kind: "connector";
      objectId: string;
    }
  | {
      kind: "canvas";
    };

export type HitTestResult = {
  type: "object" | "canvas";
  objectId: string | null;
  objectType?: BoardObjectKind;
};

export function isObjectSelectable(objectItem: BoardObject, point: Point): boolean {
  const minX = objectItem.x;
  const minY = objectItem.y;
  const maxX = objectItem.x + objectItem.width;
  const maxY = objectItem.y + objectItem.height;

  return (
    point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY
  );
}

export function getObjectHitTarget(
  objects: BoardObject[],
  point: Point,
): HitTestResult {
  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const objectItem = objects[index];
    if (!objectItem) {
      continue;
    }

    if (isObjectSelectable(objectItem, point)) {
      return {
        type: "object",
        objectId: objectItem.id,
        objectType: objectItem.type,
      };
    }
  }

  return { type: "canvas", objectId: null };
}

export function projectClientToBoard(
  clientX: number,
  clientY: number,
  viewport: { x: number; y: number; scale: number },
): Point {
  return {
    x: (clientX - viewport.x) / Math.max(viewport.scale, 0.0001),
    y: (clientY - viewport.y) / Math.max(viewport.scale, 0.0001),
  };
}

export type { Point as CanvasPoint };

export function toCanvasPoint(
  boardX: number,
  boardY: number,
  viewport: { x: number; y: number; scale: number },
): Point {
  return {
    x: viewport.x + boardX * viewport.scale,
    y: viewport.y + boardY * viewport.scale,
  };
}
