import type { CollectionReference, Firestore } from "firebase-admin/firestore";

import type { BoardObjectSnapshot, BoardToolCall, ViewportBounds } from "@/features/ai/types";
import {
  DELETE_BATCH_CHUNK_SIZE,
  MOVE_OBJECTS_DEFAULT_PADDING,
  MOVE_OBJECTS_MAX_PADDING,
  MOVE_OBJECTS_MIN_PADDING,
  VIEWPORT_SIDE_STACK_GAP,
} from "@/features/ai/tools/board-tools/constants";
import { type UpdateObjectPayload } from "@/features/ai/tools/board-tools/object-utils";
import { toGridDimension } from "@/features/ai/tools/board-tools/value-utils";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

type Bounds = { left: number; right: number; top: number; bottom: number };

function clampPosition(
  value: number,
  min: number,
  max: number,
): number {
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function arrangeToVerticalSide(
  objects: BoardObjectSnapshot[],
  side: "left" | "right",
  bounds: Bounds,
  padding: number,
): void {
  const gap = VIEWPORT_SIDE_STACK_GAP;
  const maxWidth = Math.max(...objects.map((objectItem) => objectItem.width));
  const maxHeight = Math.max(...objects.map((objectItem) => objectItem.height));
  const availableHeight = Math.max(
    maxHeight,
    bounds.bottom - bounds.top - padding * 2,
  );
  const rowsPerColumn = Math.max(
    1,
    Math.floor((availableHeight + gap) / (maxHeight + gap)),
  );

  objects.forEach((objectItem, index) => {
    const columnIndex = Math.floor(index / rowsPerColumn);
    const rowIndex = index % rowsPerColumn;
    const targetX =
      side === "left"
        ? bounds.left + padding + columnIndex * (maxWidth + gap)
        : bounds.right - padding - objectItem.width - columnIndex * (maxWidth + gap);
    const targetY = bounds.top + padding + rowIndex * (maxHeight + gap);

    objectItem.x = clampPosition(
      targetX,
      bounds.left,
      bounds.right - objectItem.width,
    );
    objectItem.y = clampPosition(
      targetY,
      bounds.top,
      bounds.bottom - objectItem.height,
    );
  });
}

function arrangeToHorizontalSide(
  objects: BoardObjectSnapshot[],
  side: "top" | "bottom",
  bounds: Bounds,
  padding: number,
): void {
  const gap = VIEWPORT_SIDE_STACK_GAP;
  const maxWidth = Math.max(...objects.map((objectItem) => objectItem.width));
  const maxHeight = Math.max(...objects.map((objectItem) => objectItem.height));
  const availableWidth = Math.max(
    maxWidth,
    bounds.right - bounds.left - padding * 2,
  );
  const columnsPerRow = Math.max(
    1,
    Math.floor((availableWidth + gap) / (maxWidth + gap)),
  );

  objects.forEach((objectItem, index) => {
    const rowIndex = Math.floor(index / columnsPerRow);
    const columnIndex = index % columnsPerRow;
    const targetX = bounds.left + padding + columnIndex * (maxWidth + gap);
    const targetY =
      side === "top"
        ? bounds.top + padding + rowIndex * (maxHeight + gap)
        : bounds.bottom - padding - objectItem.height - rowIndex * (maxHeight + gap);

    objectItem.x = clampPosition(
      targetX,
      bounds.left,
      bounds.right - objectItem.width,
    );
    objectItem.y = clampPosition(
      targetY,
      bounds.top,
      bounds.bottom - objectItem.height,
    );
  });
}

type MoveEditDeleteContext = {
  resolveSelectedObjects: (objectIds: string[]) => Promise<BoardObjectSnapshot[]>;
  getTargetAreaBounds: (
    viewportBounds?: ViewportBounds,
  ) =>
    | {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }
    | null;
  updateObjectsInBatch: (
    updates: Array<{
      objectId: string;
      payload: UpdateObjectPayload;
    }>,
  ) => Promise<void>;
  updateObject: (objectId: string, payload: UpdateObjectPayload) => Promise<void>;
  ensureLoadedObjects: () => Promise<void>;
  objectsById: Map<string, BoardObjectSnapshot>;
  db: Firestore;
  objectsCollection: CollectionReference;
};

export async function moveObjectsTool(
  context: MoveEditDeleteContext,
  args: {
    objectIds: string[];
    delta?: { dx: number; dy: number };
    toPoint?: { x: number; y: number };
    toViewportSide?: {
      side: "left" | "right" | "top" | "bottom";
      viewportBounds?: ViewportBounds;
      padding?: number;
    };
  },
): Promise<ExecuteToolResultLike> {
  const selectedObjects = await context.resolveSelectedObjects(args.objectIds);
  if (selectedObjects.length === 0) {
    return { tool: "moveObjects" };
  }

  let dx = 0;
  let dy = 0;
  if (args.toPoint) {
    const anchor = selectedObjects[0];
    dx = args.toPoint.x - anchor.x;
    dy = args.toPoint.y - anchor.y;
  } else if (args.toViewportSide) {
    const targetBounds = context.getTargetAreaBounds(args.toViewportSide.viewportBounds);
    if (!targetBounds) {
      return { tool: "moveObjects" };
    }

    const padding = toGridDimension(
      args.toViewportSide.padding,
      MOVE_OBJECTS_DEFAULT_PADDING,
      MOVE_OBJECTS_MIN_PADDING,
      MOVE_OBJECTS_MAX_PADDING,
    );
    if (
      args.toViewportSide.side === "left" ||
      args.toViewportSide.side === "right"
    ) {
      const ordered = [...selectedObjects].sort(
        (first, second) => first.y - second.y || first.x - second.x,
      );
      arrangeToVerticalSide(ordered, args.toViewportSide.side, targetBounds, padding);
    } else {
      const ordered = [...selectedObjects].sort(
        (first, second) => first.x - second.x || first.y - second.y,
      );
      arrangeToHorizontalSide(ordered, args.toViewportSide.side, targetBounds, padding);
    }

    await context.updateObjectsInBatch(
      selectedObjects.map((objectItem) => ({
        objectId: objectItem.id,
        payload: { x: objectItem.x, y: objectItem.y },
      })),
    );
    return { tool: "moveObjects" };
  } else if (args.delta) {
    dx = args.delta.dx;
    dy = args.delta.dy;
  } else {
    return { tool: "moveObjects" };
  }

  await context.updateObjectsInBatch(
    selectedObjects.map((objectItem) => ({
      objectId: objectItem.id,
      payload: { x: objectItem.x + dx, y: objectItem.y + dy },
    })),
  );
  return { tool: "moveObjects" };
}

export async function moveObjectTool(
  context: MoveEditDeleteContext,
  args: { objectId: string; x: number; y: number },
): Promise<ExecuteToolResultLike> {
  await context.updateObject(args.objectId, { x: args.x, y: args.y });
  return { tool: "moveObject", objectId: args.objectId };
}

export async function resizeObjectTool(
  context: MoveEditDeleteContext,
  args: { objectId: string; width: number; height: number },
): Promise<ExecuteToolResultLike> {
  await context.updateObject(args.objectId, {
    width: Math.max(1, args.width),
    height: Math.max(1, args.height),
  });
  return { tool: "resizeObject", objectId: args.objectId };
}

export async function updateTextTool(
  context: MoveEditDeleteContext,
  args: { objectId: string; newText: string },
): Promise<ExecuteToolResultLike> {
  await context.updateObject(args.objectId, { text: args.newText.slice(0, 1_000) });
  return { tool: "updateText", objectId: args.objectId };
}

export async function changeColorTool(
  context: MoveEditDeleteContext,
  args: { objectId: string; color: string },
): Promise<ExecuteToolResultLike> {
  await context.updateObject(args.objectId, { color: args.color });
  return { tool: "changeColor", objectId: args.objectId };
}

export async function deleteObjectsTool(
  context: MoveEditDeleteContext,
  args: { objectIds: string[] },
): Promise<ExecuteToolResultLike> {
  await context.ensureLoadedObjects();
  const uniqueObjectIds = Array.from(new Set(args.objectIds.map((value) => value.trim()))).filter(
    (value) => value.length > 0,
  );
  const existingObjectIds = uniqueObjectIds.filter((objectId) =>
    context.objectsById.has(objectId),
  );
  if (existingObjectIds.length === 0) {
    return { tool: "deleteObjects", deletedCount: 0 };
  }

  for (
    let index = 0;
    index < existingObjectIds.length;
    index += DELETE_BATCH_CHUNK_SIZE
  ) {
    const chunk = existingObjectIds.slice(index, index + DELETE_BATCH_CHUNK_SIZE);
    const batch = context.db.batch();
    chunk.forEach((objectId) => {
      batch.delete(context.objectsCollection.doc(objectId));
    });
    await batch.commit();
  }

  existingObjectIds.forEach((objectId) => {
    context.objectsById.delete(objectId);
  });
  return { tool: "deleteObjects", deletedCount: existingObjectIds.length };
}
