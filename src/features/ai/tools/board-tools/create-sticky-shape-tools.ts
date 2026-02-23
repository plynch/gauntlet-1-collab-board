import { FieldValue, type CollectionReference, type Firestore } from "firebase-admin/firestore";

import type { BoardObjectSnapshot, BoardObjectToolKind, BoardToolCall } from "@/features/ai/types";
import { toNearestStickyPaletteColor } from "@/features/ai/tools/board-tools/color-utils";
import {
  LAYOUT_GRID_MAX_GAP,
  LAYOUT_GRID_MIN_GAP,
  SHAPE_BATCH_DEFAULT_HEIGHT,
  SHAPE_BATCH_DEFAULT_WIDTH,
  SHAPE_BATCH_MAX_COLUMNS,
  SHAPE_BATCH_MAX_COUNT,
  SHAPE_BATCH_MAX_GAP,
  SHAPE_BATCH_MIN_COLUMNS,
  SHAPE_BATCH_MIN_COUNT,
  SHAPE_BATCH_MIN_GAP,
  STICKY_BATCH_DEFAULT_COLUMNS,
  STICKY_BATCH_DEFAULT_GAP_X,
  STICKY_BATCH_DEFAULT_GAP_Y,
  STICKY_BATCH_MAX_COLUMNS,
  STICKY_BATCH_MAX_COUNT,
  STICKY_BATCH_MIN_COLUMNS,
  STICKY_BATCH_MIN_COUNT,
} from "@/features/ai/tools/board-tools/constants";
import { toGridDimension, toOptionalString } from "@/features/ai/tools/board-tools/value-utils";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

type CreateObjectInput = {
  type: BoardObjectToolKind;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  text?: string;
  rotationDeg?: number;
  gridRows?: number;
  gridCols?: number;
  gridGap?: number;
  gridCellColors?: string[];
  containerTitle?: string;
  gridSectionTitles?: string[];
  gridSectionNotes?: string[];
};

type CreateStickyShapeContext = {
  ensureLoadedObjects: () => Promise<void>;
  createObject: (options: CreateObjectInput) => Promise<BoardObjectSnapshot>;
  db: Firestore;
  objectsCollection: CollectionReference;
  objectsById: Map<string, BoardObjectSnapshot>;
  allocateZIndex: () => number;
  userId: string;
};

export async function createStickyNoteTool(
  context: CreateStickyShapeContext,
  args: {
    text: string;
    x: number;
    y: number;
    color: string;
  },
): Promise<ExecuteToolResultLike> {
  const normalizedColor = toNearestStickyPaletteColor(args.color);
  const created = await context.createObject({
    type: "sticky",
    text: args.text.slice(0, 1_000),
    x: args.x,
    y: args.y,
    width: 180,
    height: 140,
    color: normalizedColor,
  });

  return { tool: "createStickyNote", objectId: created.id };
}

export async function createStickyBatchTool(
  context: CreateStickyShapeContext,
  args: {
    count: number;
    color: string;
    originX: number;
    originY: number;
    columns?: number;
    gapX?: number;
    gapY?: number;
    textPrefix?: string;
  },
): Promise<ExecuteToolResultLike> {
  await context.ensureLoadedObjects();

  const count = toGridDimension(
    args.count,
    STICKY_BATCH_MIN_COUNT,
    STICKY_BATCH_MIN_COUNT,
    STICKY_BATCH_MAX_COUNT,
  );
  const columns = toGridDimension(
    args.columns,
    STICKY_BATCH_DEFAULT_COLUMNS,
    STICKY_BATCH_MIN_COLUMNS,
    STICKY_BATCH_MAX_COLUMNS,
  );
  const gapX = toGridDimension(
    args.gapX,
    STICKY_BATCH_DEFAULT_GAP_X,
    LAYOUT_GRID_MIN_GAP,
    LAYOUT_GRID_MAX_GAP,
  );
  const gapY = toGridDimension(
    args.gapY,
    STICKY_BATCH_DEFAULT_GAP_Y,
    LAYOUT_GRID_MIN_GAP,
    LAYOUT_GRID_MAX_GAP,
  );
  const normalizedColor = toNearestStickyPaletteColor(args.color);
  const textPrefix = toOptionalString(args.textPrefix, 960) ?? "Sticky";
  const createdObjectIds: string[] = [];

  const chunkSize = 400;
  for (let index = 0; index < count; index += chunkSize) {
    const chunkCount = Math.min(chunkSize, count - index);
    const batch = context.db.batch();

    for (let offset = 0; offset < chunkCount; offset += 1) {
      const absoluteIndex = index + offset;
      const row = Math.floor(absoluteIndex / columns);
      const column = absoluteIndex % columns;
      const x = args.originX + column * gapX;
      const y = args.originY + row * gapY;
      const stickyText = count === 1 ? textPrefix : `${textPrefix} ${absoluteIndex + 1}`;
      const docRef = context.objectsCollection.doc();
      const payload = {
        type: "sticky",
        zIndex: context.allocateZIndex(),
        x,
        y,
        width: 180,
        height: 140,
        rotationDeg: 0,
        color: normalizedColor,
        text: stickyText.slice(0, 1_000),
        createdBy: context.userId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      } satisfies Record<string, unknown>;

      batch.set(docRef, payload);
      context.objectsById.set(docRef.id, {
        id: docRef.id,
        type: "sticky",
        zIndex: payload.zIndex as number,
        x: payload.x as number,
        y: payload.y as number,
        width: payload.width as number,
        height: payload.height as number,
        rotationDeg: payload.rotationDeg as number,
        color: payload.color as string,
        text: payload.text as string,
        updatedAt: null,
      });
      createdObjectIds.push(docRef.id);
    }

    await batch.commit();
  }

  return {
    tool: "createStickyBatch",
    objectId: createdObjectIds[0],
    createdObjectIds,
  };
}

export async function createShapeTool(
  context: CreateStickyShapeContext,
  args: {
    type: BoardObjectToolKind;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  },
): Promise<ExecuteToolResultLike> {
  if (args.type === "gridContainer" || args.type.startsWith("connector")) {
    throw new Error("createShape only supports non-connector board shapes.");
  }

  const minimumWidth = args.type === "line" ? 24 : 20;
  const minimumHeight = args.type === "line" ? 2 : 20;
  const created = await context.createObject({
    type: args.type,
    x: args.x,
    y: args.y,
    width: Math.max(minimumWidth, args.width),
    height: Math.max(minimumHeight, args.height),
    color: args.color,
  });

  return { tool: "createShape", objectId: created.id };
}

export async function createShapeBatchTool(
  context: CreateStickyShapeContext,
  args: {
    count: number;
    type: "rect" | "circle" | "line" | "triangle" | "star";
    originX: number;
    originY: number;
    width?: number;
    height?: number;
    color?: string;
    colors?: string[];
    columns?: number;
    gapX?: number;
    gapY?: number;
  },
): Promise<ExecuteToolResultLike> {
  const count = toGridDimension(
    args.count,
    SHAPE_BATCH_MIN_COUNT,
    SHAPE_BATCH_MIN_COUNT,
    SHAPE_BATCH_MAX_COUNT,
  );
  const columns = toGridDimension(
    args.columns,
    Math.min(
      SHAPE_BATCH_MAX_COLUMNS,
      Math.max(SHAPE_BATCH_MIN_COLUMNS, Math.ceil(Math.sqrt(count))),
    ),
    SHAPE_BATCH_MIN_COLUMNS,
    SHAPE_BATCH_MAX_COLUMNS,
  );
  const minimumWidth = args.type === "line" ? 24 : 20;
  const minimumHeight = args.type === "line" ? 2 : 20;
  const width = Math.max(
    minimumWidth,
    toGridDimension(args.width, SHAPE_BATCH_DEFAULT_WIDTH, minimumWidth, 2_000),
  );
  const height = Math.max(
    minimumHeight,
    toGridDimension(args.height, SHAPE_BATCH_DEFAULT_HEIGHT, minimumHeight, 2_000),
  );
  const gapX = toGridDimension(
    args.gapX,
    Math.max(32, width + 24),
    SHAPE_BATCH_MIN_GAP,
    SHAPE_BATCH_MAX_GAP,
  );
  const gapY = toGridDimension(
    args.gapY,
    Math.max(32, height + 24),
    SHAPE_BATCH_MIN_GAP,
    SHAPE_BATCH_MAX_GAP,
  );
  const baseColor = toOptionalString(args.color, 32) ?? "#93c5fd";
  const colorPool = (args.colors ?? [])
    .map((value) => toOptionalString(value, 32))
    .filter((value): value is string => Boolean(value));
  const createdObjectIds: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const created = await context.createObject({
      type: args.type,
      x: args.originX + column * (width + gapX),
      y: args.originY + row * (height + gapY),
      width,
      height,
      color: colorPool[index % colorPool.length] ?? baseColor,
    });
    createdObjectIds.push(created.id);
  }

  return {
    tool: "createShapeBatch",
    objectId: createdObjectIds[0],
    createdObjectIds,
  };
}
