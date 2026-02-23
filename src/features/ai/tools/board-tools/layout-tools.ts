import type { BoardObjectSnapshot, BoardToolCall, ViewportBounds } from "@/features/ai/types";
import {
  LAYOUT_GRID_DEFAULT_COLUMNS,
  LAYOUT_GRID_DEFAULT_GAP,
  LAYOUT_GRID_MAX_COLUMNS,
  LAYOUT_GRID_MAX_GAP,
  LAYOUT_GRID_MIN_COLUMNS,
  LAYOUT_GRID_MIN_GAP,
  type LayoutAlignment,
} from "@/features/ai/tools/board-tools/constants";
import { toObjectCenter, type UpdateObjectPayload } from "@/features/ai/tools/board-tools/object-utils";
import { toGridDimension, toNumber } from "@/features/ai/tools/board-tools/value-utils";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

type LayoutToolsContext = {
  resolveSelectedObjects: (objectIds: string[]) => Promise<BoardObjectSnapshot[]>;
  sortObjectsByPosition: (objects: BoardObjectSnapshot[]) => BoardObjectSnapshot[];
  updateObjectsInBatch: (
    updates: Array<{
      objectId: string;
      payload: UpdateObjectPayload;
    }>,
  ) => Promise<void>;
};

export async function arrangeObjectsInGridTool(
  context: LayoutToolsContext,
  args: {
    objectIds: string[];
    columns: number;
    gapX?: number;
    gapY?: number;
    originX?: number;
    originY?: number;
    viewportBounds?: ViewportBounds;
    centerInViewport?: boolean;
  },
): Promise<ExecuteToolResultLike> {
  const selectedObjects = await context.resolveSelectedObjects(args.objectIds);
  if (selectedObjects.length < 2) {
    return { tool: "arrangeObjectsInGrid" };
  }
  const sortedObjects = context.sortObjectsByPosition(selectedObjects);
  const columns = toGridDimension(
    args.columns,
    LAYOUT_GRID_DEFAULT_COLUMNS,
    LAYOUT_GRID_MIN_COLUMNS,
    LAYOUT_GRID_MAX_COLUMNS,
  );
  const gapX = toGridDimension(
    args.gapX,
    LAYOUT_GRID_DEFAULT_GAP,
    LAYOUT_GRID_MIN_GAP,
    LAYOUT_GRID_MAX_GAP,
  );
  const gapY = toGridDimension(
    args.gapY,
    LAYOUT_GRID_DEFAULT_GAP,
    LAYOUT_GRID_MIN_GAP,
    LAYOUT_GRID_MAX_GAP,
  );
  const cellWidth = Math.max(...sortedObjects.map((objectItem) => Math.max(1, objectItem.width)));
  const cellHeight = Math.max(...sortedObjects.map((objectItem) => Math.max(1, objectItem.height)));
  const defaultOriginX = Math.min(...sortedObjects.map((item) => item.x));
  const defaultOriginY = Math.min(...sortedObjects.map((item) => item.y));
  const hasViewportBounds =
    Boolean(args.viewportBounds) &&
    Number.isFinite(args.viewportBounds?.left) &&
    Number.isFinite(args.viewportBounds?.top) &&
    Number.isFinite(args.viewportBounds?.width) &&
    Number.isFinite(args.viewportBounds?.height) &&
    (args.viewportBounds?.width ?? 0) > 0 &&
    (args.viewportBounds?.height ?? 0) > 0;
  const shouldCenterInViewport = Boolean(args.centerInViewport && hasViewportBounds);

  let originX = toNumber(args.originX, defaultOriginX);
  let originY = toNumber(args.originY, defaultOriginY);
  if (shouldCenterInViewport) {
    const columnsUsed = Math.max(1, Math.min(columns, sortedObjects.length));
    const rowsUsed = Math.max(1, Math.ceil(sortedObjects.length / columns));
    const gridWidth = columnsUsed * cellWidth + (columnsUsed - 1) * gapX;
    const gridHeight = rowsUsed * cellHeight + (rowsUsed - 1) * gapY;

    if (!Number.isFinite(args.originX)) {
      originX = (args.viewportBounds?.left ?? 0) + ((args.viewportBounds?.width ?? 0) - gridWidth) / 2;
    }
    if (!Number.isFinite(args.originY)) {
      originY = (args.viewportBounds?.top ?? 0) + ((args.viewportBounds?.height ?? 0) - gridHeight) / 2;
    }
  }

  const updates = sortedObjects.map((objectItem, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const nextX = originX + column * (cellWidth + gapX);
    const nextY = originY + row * (cellHeight + gapY);
    return { objectId: objectItem.id, payload: { x: nextX, y: nextY } };
  });
  await context.updateObjectsInBatch(updates);
  return { tool: "arrangeObjectsInGrid" };
}

export async function alignObjectsTool(
  context: LayoutToolsContext,
  args: {
    objectIds: string[];
    alignment: LayoutAlignment;
  },
): Promise<ExecuteToolResultLike> {
  const selectedObjects = await context.resolveSelectedObjects(args.objectIds);
  if (selectedObjects.length < 2) {
    return { tool: "alignObjects" };
  }

  const minLeft = Math.min(...selectedObjects.map((objectItem) => objectItem.x));
  const maxRight = Math.max(...selectedObjects.map((objectItem) => objectItem.x + objectItem.width));
  const minTop = Math.min(...selectedObjects.map((objectItem) => objectItem.y));
  const maxBottom = Math.max(...selectedObjects.map((objectItem) => objectItem.y + objectItem.height));
  const centerX = (minLeft + maxRight) / 2;
  const centerY = (minTop + maxBottom) / 2;

  const updates = selectedObjects.map((objectItem) => {
    if (args.alignment === "left") return { objectId: objectItem.id, payload: { x: minLeft } };
    if (args.alignment === "center") {
      return { objectId: objectItem.id, payload: { x: centerX - objectItem.width / 2 } };
    }
    if (args.alignment === "right") {
      return { objectId: objectItem.id, payload: { x: maxRight - objectItem.width } };
    }
    if (args.alignment === "top") return { objectId: objectItem.id, payload: { y: minTop } };
    if (args.alignment === "middle") {
      return { objectId: objectItem.id, payload: { y: centerY - objectItem.height / 2 } };
    }
    return { objectId: objectItem.id, payload: { y: maxBottom - objectItem.height } };
  });
  await context.updateObjectsInBatch(updates);
  return { tool: "alignObjects" };
}

export async function distributeObjectsTool(
  context: LayoutToolsContext,
  args: {
    objectIds: string[];
    axis: "horizontal" | "vertical";
    viewportBounds?: ViewportBounds;
  },
): Promise<ExecuteToolResultLike> {
  const selectedObjects = await context.resolveSelectedObjects(args.objectIds);
  if (selectedObjects.length < 3) {
    return { tool: "distributeObjects" };
  }

  const sortedObjects = [...selectedObjects].sort((left, right) => {
    const leftCenter = toObjectCenter(left);
    const rightCenter = toObjectCenter(right);
    if (args.axis === "horizontal" && leftCenter.x !== rightCenter.x) {
      return leftCenter.x - rightCenter.x;
    }
    if (args.axis === "vertical" && leftCenter.y !== rightCenter.y) {
      return leftCenter.y - rightCenter.y;
    }
    if (left.zIndex !== right.zIndex) {
      return left.zIndex - right.zIndex;
    }
    return left.id.localeCompare(right.id);
  });

  const first = sortedObjects[0];
  const last = sortedObjects[sortedObjects.length - 1];
  if (!first || !last) {
    return { tool: "distributeObjects" };
  }

  const firstCenter = toObjectCenter(first);
  const lastCenter = toObjectCenter(last);
  const hasViewportBounds =
    Boolean(args.viewportBounds) &&
    Number.isFinite(args.viewportBounds?.width) &&
    Number.isFinite(args.viewportBounds?.height) &&
    (args.viewportBounds?.width ?? 0) > 0 &&
    (args.viewportBounds?.height ?? 0) > 0;
  const spanStart =
    hasViewportBounds && args.axis === "horizontal"
      ? (args.viewportBounds?.left ?? 0) + first.width / 2
      : hasViewportBounds && args.axis === "vertical"
        ? (args.viewportBounds?.top ?? 0) + first.height / 2
        : args.axis === "horizontal"
          ? firstCenter.x
          : firstCenter.y;
  const spanEnd =
    hasViewportBounds && args.axis === "horizontal"
      ? (args.viewportBounds?.left ?? 0) + (args.viewportBounds?.width ?? 0) - last.width / 2
      : hasViewportBounds && args.axis === "vertical"
        ? (args.viewportBounds?.top ?? 0) + (args.viewportBounds?.height ?? 0) - last.height / 2
        : args.axis === "horizontal"
          ? lastCenter.x
          : lastCenter.y;
  const step = (spanEnd - spanStart) / (sortedObjects.length - 1);
  const shouldMoveEndpoints = hasViewportBounds && spanEnd > spanStart;

  const updates: Array<{ objectId: string; payload: UpdateObjectPayload }> = [];
  const startIndex = shouldMoveEndpoints ? 0 : 1;
  const endIndex = shouldMoveEndpoints ? sortedObjects.length : sortedObjects.length - 1;
  for (let index = startIndex; index < endIndex; index += 1) {
    const objectItem = sortedObjects[index];
    const nextCenter = spanStart + step * index;
    updates.push(
      args.axis === "horizontal"
        ? { objectId: objectItem.id, payload: { x: nextCenter - objectItem.width / 2 } }
        : { objectId: objectItem.id, payload: { y: nextCenter - objectItem.height / 2 } },
    );
  }
  await context.updateObjectsInBatch(updates);
  return { tool: "distributeObjects" };
}
