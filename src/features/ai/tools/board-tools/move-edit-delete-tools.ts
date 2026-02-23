import type { CollectionReference, Firestore } from "firebase-admin/firestore";

import type { BoardObjectSnapshot, BoardToolCall, ViewportBounds } from "@/features/ai/types";
import {
  DELETE_BATCH_CHUNK_SIZE,
  MOVE_OBJECTS_DEFAULT_PADDING,
  MOVE_OBJECTS_MAX_PADDING,
  MOVE_OBJECTS_MIN_PADDING,
  VIEWPORT_SIDE_STACK_GAP,
} from "@/features/ai/tools/board-tools/constants";
import { toCombinedBounds, type UpdateObjectPayload } from "@/features/ai/tools/board-tools/object-utils";
import { toGridDimension } from "@/features/ai/tools/board-tools/value-utils";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

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
    const selectedBounds = toCombinedBounds(selectedObjects);
    const targetBounds = context.getTargetAreaBounds(args.toViewportSide.viewportBounds);
    if (!selectedBounds || !targetBounds) {
      return { tool: "moveObjects" };
    }

    const padding = toGridDimension(
      args.toViewportSide.padding,
      MOVE_OBJECTS_DEFAULT_PADDING,
      MOVE_OBJECTS_MIN_PADDING,
      MOVE_OBJECTS_MAX_PADDING,
    );
    const groupWidth = Math.max(1, selectedBounds.right - selectedBounds.left);
    const groupHeight = Math.max(1, selectedBounds.bottom - selectedBounds.top);
    const targetLeftBase =
      args.toViewportSide.side === "left"
        ? targetBounds.left + padding
        : args.toViewportSide.side === "right"
          ? targetBounds.right - groupWidth - padding
          : selectedBounds.left;
    const targetTopBase =
      args.toViewportSide.side === "top"
        ? targetBounds.top + padding
        : args.toViewportSide.side === "bottom"
          ? targetBounds.bottom - groupHeight - padding
          : selectedBounds.top;
    const minLeft = targetBounds.left;
    const maxLeft = targetBounds.right - groupWidth;
    const minTop = targetBounds.top;
    const maxTop = targetBounds.bottom - groupHeight;
    const targetLeft =
      minLeft <= maxLeft
        ? Math.min(maxLeft, Math.max(minLeft, targetLeftBase))
        : targetLeftBase;
    const targetTop =
      minTop <= maxTop
        ? Math.min(maxTop, Math.max(minTop, targetTopBase))
        : targetTopBase;
    const isLeftOrRight =
      args.toViewportSide.side === "left" || args.toViewportSide.side === "right";

    if (isLeftOrRight) {
      const ordered = [...selectedObjects].sort((first, second) => (first.y - second.y) || (first.x - second.x));
      const totalHeight =
        ordered.reduce((sum, objectItem) => sum + objectItem.height, 0) +
        Math.max(0, ordered.length - 1) * VIEWPORT_SIDE_STACK_GAP;
      const stackHeightMaxTop = Math.max(minTop, targetBounds.bottom - totalHeight);
      const startTop = Math.min(stackHeightMaxTop, Math.max(minTop, targetTop));
      let yCursor = startTop;
      ordered.forEach((objectItem) => {
        objectItem.x = targetLeft;
        objectItem.y = yCursor;
        yCursor += objectItem.height + VIEWPORT_SIDE_STACK_GAP;
      });
    } else {
      const ordered = [...selectedObjects].sort((first, second) => (first.x - second.x) || (first.y - second.y));
      const totalWidth =
        ordered.reduce((sum, objectItem) => sum + objectItem.width, 0) +
        Math.max(0, ordered.length - 1) * VIEWPORT_SIDE_STACK_GAP;
      const maxRowLeft = targetBounds.right - totalWidth;
      const startLeft = Math.min(maxRowLeft, Math.max(minLeft, targetLeft));
      let xCursor = startLeft;
      ordered.forEach((objectItem) => {
        objectItem.x = xCursor;
        objectItem.y = targetTop;
        xCursor += objectItem.width + VIEWPORT_SIDE_STACK_GAP;
      });
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
