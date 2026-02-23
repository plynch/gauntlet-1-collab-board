import {
  FieldValue,
  type Firestore,
} from "firebase-admin/firestore";

import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  TemplatePlan,
  ViewportBounds,
} from "@/features/ai/types";
import {
  createConnectorTool,
  createFrameTool,
  createGridContainerTool,
} from "@/features/ai/tools/board-tools/create-container-connector-tools";
import {
  createShapeBatchTool,
  createShapeTool,
  createStickyBatchTool,
  createStickyNoteTool,
} from "@/features/ai/tools/board-tools/create-sticky-shape-tools";
import {
  DELETE_BATCH_CHUNK_SIZE,
  FRAME_FIT_DEFAULT_PADDING,
  FRAME_FIT_MAX_PADDING,
  FRAME_FIT_MIN_PADDING,
  LAYOUT_GRID_DEFAULT_COLUMNS,
  LAYOUT_GRID_DEFAULT_GAP,
  LAYOUT_GRID_MAX_COLUMNS,
  LAYOUT_GRID_MAX_GAP,
  LAYOUT_GRID_MIN_COLUMNS,
  LAYOUT_GRID_MIN_GAP,
  MOVE_OBJECTS_DEFAULT_PADDING,
  MOVE_OBJECTS_MAX_PADDING,
  MOVE_OBJECTS_MIN_PADDING,
  VIEWPORT_SIDE_STACK_GAP,
  type BoardToolExecutorOptions,
  type LayoutAlignment,
} from "@/features/ai/tools/board-tools/constants";
import {
  boundsOverlap,
  isBackgroundContainerType,
  toBoardObjectDoc,
  toCombinedBounds,
  toObjectBounds,
  toObjectCenter,
  type UpdateObjectPayload,
} from "@/features/ai/tools/board-tools/object-utils";
import {
  toGridCellColors,
  toGridDimension,
  toNullableFiniteNumber,
  toNumber,
  toOptionalString,
  toStringArray,
} from "@/features/ai/tools/board-tools/value-utils";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

type ExecuteToolResult = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

export class BoardToolExecutor {
  private readonly boardId: string;
  private readonly userId: string;
  private readonly db: Firestore;
  private readonly objectsById = new Map<string, BoardObjectSnapshot>();
  private hasLoadedObjects = false;
  private nextZIndex = 1;

    constructor(options: BoardToolExecutorOptions) {
    this.boardId = options.boardId;
    this.userId = options.userId;
    this.db = options.db ?? getFirebaseAdminDb();
  }

  private get objectsCollection() {
    return this.db.collection("boards").doc(this.boardId).collection("objects");
  }

    private async ensureLoadedObjects(): Promise<void> {
    if (this.hasLoadedObjects) {
      return;
    }

    const snapshot = await this.objectsCollection.get();
    this.objectsById.clear();

    snapshot.docs.forEach((doc) => {
      const parsed = toBoardObjectDoc(
        doc.id,
        doc.data() as Record<string, unknown>,
      );
      if (parsed) {
        this.objectsById.set(parsed.id, parsed);
      }
    });

    this.nextZIndex =
      this.objectsById.size > 0
        ? Math.max(
            ...Array.from(this.objectsById.values()).map((item) => item.zIndex),
          ) + 1
        : 1;
    this.hasLoadedObjects = true;
  }

    async getBoardState(): Promise<BoardObjectSnapshot[]> {
    await this.ensureLoadedObjects();
    return Array.from(this.objectsById.values()).sort(
      (left, right) => left.zIndex - right.zIndex,
    );
  }

    private getNextZIndexForType(type: BoardObjectToolKind): number {
    if (!isBackgroundContainerType(type)) {
      return this.nextZIndex++;
    }

    const lowestZIndex = Array.from(this.objectsById.values()).reduce(
      (minimum, objectItem) => Math.min(minimum, objectItem.zIndex),
      0,
    );
    return lowestZIndex - 1;
  }

    private async createObject(options: {
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
  }): Promise<BoardObjectSnapshot> {
    await this.ensureLoadedObjects();

    const payload: Record<string, unknown> = {
      type: options.type,
      zIndex: this.getNextZIndexForType(options.type),
      x: options.x,
      y: options.y,
      width: Math.max(1, options.width),
      height: Math.max(1, options.height),
      rotationDeg: options.rotationDeg ?? 0,
      color: options.color,
      text: options.text ?? "",
      createdBy: this.userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (
      typeof options.gridRows === "number" &&
      typeof options.gridCols === "number" &&
      typeof options.gridGap === "number"
    ) {
      payload.gridRows = options.gridRows;
      payload.gridCols = options.gridCols;
      payload.gridGap = options.gridGap;
      if (options.gridCellColors && options.gridCellColors.length > 0) {
        payload.gridCellColors = options.gridCellColors;
      }
    }
    if (
      typeof options.containerTitle === "string" &&
      options.containerTitle.trim().length > 0
    ) {
      payload.containerTitle = options.containerTitle.trim().slice(0, 120);
    }
    if (options.gridSectionTitles && options.gridSectionTitles.length > 0) {
      payload.gridSectionTitles = options.gridSectionTitles.map((title) =>
        title.slice(0, 80),
      );
    }
    if (options.gridSectionNotes && options.gridSectionNotes.length > 0) {
      payload.gridSectionNotes = options.gridSectionNotes.map((note) =>
        note.slice(0, 600),
      );
    }

    const created = await this.objectsCollection.add(payload);
    const snapshot: BoardObjectSnapshot = {
      id: created.id,
      type: payload.type as BoardObjectToolKind,
      zIndex: payload.zIndex as number,
      x: payload.x as number,
      y: payload.y as number,
      width: payload.width as number,
      height: payload.height as number,
      rotationDeg: payload.rotationDeg as number,
      color: payload.color as string,
      text: payload.text as string,
      gridRows: toNullableFiniteNumber(payload.gridRows),
      gridCols: toNullableFiniteNumber(payload.gridCols),
      gridGap: toNullableFiniteNumber(payload.gridGap),
      gridCellColors: toGridCellColors(payload.gridCellColors),
      containerTitle: toOptionalString(payload.containerTitle, 120),
      gridSectionTitles: toStringArray(payload.gridSectionTitles),
      gridSectionNotes: toStringArray(payload.gridSectionNotes),
      updatedAt: null,
    };

    this.objectsById.set(snapshot.id, snapshot);
    return snapshot;
  }

    private async updateObject(
    objectId: string,
    payload: UpdateObjectPayload,
  ): Promise<void> {
    await this.ensureLoadedObjects();
    const existing = this.objectsById.get(objectId);
    if (!existing) {
      throw new Error(`Object not found: ${objectId}`);
    }

    await this.objectsCollection.doc(objectId).update({
      ...payload,
      updatedAt: FieldValue.serverTimestamp(),
    });

    this.objectsById.set(objectId, {
      ...existing,
      ...payload,
    });
  }

    private async updateObjectsInBatch(
    updates: Array<{
      objectId: string;
      payload: UpdateObjectPayload;
    }>,
  ): Promise<void> {
    await this.ensureLoadedObjects();

    const normalizedUpdates = updates.filter(
      (update) => this.objectsById.has(update.objectId),
    );
    if (normalizedUpdates.length === 0) {
      return;
    }

    for (
      let index = 0;
      index < normalizedUpdates.length;
      index += DELETE_BATCH_CHUNK_SIZE
    ) {
      const chunk = normalizedUpdates.slice(
        index,
        index + DELETE_BATCH_CHUNK_SIZE,
      );
      const batch = this.db.batch();
      chunk.forEach((entry) => {
        batch.update(this.objectsCollection.doc(entry.objectId), {
          ...entry.payload,
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      await batch.commit();
    }

    normalizedUpdates.forEach((entry) => {
      const existing = this.objectsById.get(entry.objectId);
      if (!existing) {
        return;
      }
      this.objectsById.set(entry.objectId, {
        ...existing,
        ...entry.payload,
      });
    });
  }

    private getTargetAreaBounds(
    viewportBounds?: ViewportBounds,
  ): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  } | null {
    if (viewportBounds) {
      return {
        left: viewportBounds.left,
        right: viewportBounds.left + viewportBounds.width,
        top: viewportBounds.top,
        bottom: viewportBounds.top + viewportBounds.height,
      };
    }

    return toCombinedBounds(Array.from(this.objectsById.values()));
  }

    private async resolveSelectedObjects(
    objectIds: string[],
  ): Promise<BoardObjectSnapshot[]> {
    await this.ensureLoadedObjects();

    const uniqueObjectIds = Array.from(new Set(objectIds.map((value) => value.trim())))
      .filter((value) => value.length > 0);

    return uniqueObjectIds
      .map((objectId) => this.objectsById.get(objectId))
      .filter((objectItem): objectItem is BoardObjectSnapshot =>
        Boolean(objectItem),
      );
  }

    private sortObjectsByPosition(
    objects: BoardObjectSnapshot[],
  ): BoardObjectSnapshot[] {
    return [...objects].sort((left, right) => {
      if (left.y !== right.y) {
        return left.y - right.y;
      }
      if (left.x !== right.x) {
        return left.x - right.x;
      }
      if (left.zIndex !== right.zIndex) {
        return left.zIndex - right.zIndex;
      }
      return left.id.localeCompare(right.id);
    });
  }

    async createStickyNote(args: {
    text: string;
    x: number;
    y: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    return createStickyNoteTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        db: this.db,
        objectsCollection: this.objectsCollection,
        objectsById: this.objectsById,
        allocateZIndex: () => this.nextZIndex++,
        userId: this.userId,
      },
      args,
    );
  }

    async createStickyBatch(args: {
    count: number;
    color: string;
    originX: number;
    originY: number;
    columns?: number;
    gapX?: number;
    gapY?: number;
    textPrefix?: string;
  }): Promise<ExecuteToolResult> {
    return createStickyBatchTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        db: this.db,
        objectsCollection: this.objectsCollection,
        objectsById: this.objectsById,
        allocateZIndex: () => this.nextZIndex++,
        userId: this.userId,
      },
      args,
    );
  }

    async createShape(args: {
    type: BoardObjectToolKind;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    return createShapeTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        db: this.db,
        objectsCollection: this.objectsCollection,
        objectsById: this.objectsById,
        allocateZIndex: () => this.nextZIndex++,
        userId: this.userId,
      },
      args,
    );
  }

    async createShapeBatch(args: {
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
  }): Promise<ExecuteToolResult> {
    return createShapeBatchTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        db: this.db,
        objectsCollection: this.objectsCollection,
        objectsById: this.objectsById,
        allocateZIndex: () => this.nextZIndex++,
        userId: this.userId,
      },
      args,
    );
  }

    async createGridContainer(args: {
    x: number;
    y: number;
    width: number;
    height: number;
    rows: number;
    cols: number;
    gap: number;
    cellColors?: string[];
    containerTitle?: string;
    sectionTitles?: string[];
    sectionNotes?: string[];
  }): Promise<ExecuteToolResult> {
    return createGridContainerTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        objectsById: this.objectsById,
        objectsCollection: this.objectsCollection,
        userId: this.userId,
        allocateZIndex: () => this.nextZIndex++,
      },
      args,
    );
  }

    async createFrame(args: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<ExecuteToolResult> {
    return createFrameTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        objectsById: this.objectsById,
        objectsCollection: this.objectsCollection,
        userId: this.userId,
        allocateZIndex: () => this.nextZIndex++,
      },
      args,
    );
  }

    async createConnector(args: {
    fromId: string;
    toId: string;
    style: "undirected" | "one-way-arrow" | "two-way-arrow";
  }): Promise<ExecuteToolResult> {
    return createConnectorTool(
      {
        ensureLoadedObjects: this.ensureLoadedObjects.bind(this),
        createObject: this.createObject.bind(this),
        objectsById: this.objectsById,
        objectsCollection: this.objectsCollection,
        userId: this.userId,
        allocateZIndex: () => this.nextZIndex++,
      },
      args,
    );
  }

    async arrangeObjectsInGrid(args: {
    objectIds: string[];
    columns: number;
    gapX?: number;
    gapY?: number;
    originX?: number;
    originY?: number;
    viewportBounds?: ViewportBounds;
    centerInViewport?: boolean;
  }): Promise<ExecuteToolResult> {
    const selectedObjects = await this.resolveSelectedObjects(args.objectIds);

    if (selectedObjects.length < 2) {
      return { tool: "arrangeObjectsInGrid" };
    }

    const sortedObjects = this.sortObjectsByPosition(selectedObjects);

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
    const cellWidth = Math.max(
      ...sortedObjects.map((objectItem) => Math.max(1, objectItem.width)),
    );
    const cellHeight = Math.max(
      ...sortedObjects.map((objectItem) => Math.max(1, objectItem.height)),
    );
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
        originX =
          (args.viewportBounds?.left ?? 0) +
          ((args.viewportBounds?.width ?? 0) - gridWidth) / 2;
      }
      if (!Number.isFinite(args.originY)) {
        originY =
          (args.viewportBounds?.top ?? 0) +
          ((args.viewportBounds?.height ?? 0) - gridHeight) / 2;
      }
    }

    const updates = sortedObjects.map((objectItem, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const nextX = originX + column * (cellWidth + gapX);
      const nextY = originY + row * (cellHeight + gapY);

      return {
        objectId: objectItem.id,
        payload: {
          x: nextX,
          y: nextY,
        },
      };
    });
    await this.updateObjectsInBatch(updates);

    return { tool: "arrangeObjectsInGrid" };
  }

    async alignObjects(args: {
    objectIds: string[];
    alignment: LayoutAlignment;
  }): Promise<ExecuteToolResult> {
    const selectedObjects = await this.resolveSelectedObjects(args.objectIds);
    if (selectedObjects.length < 2) {
      return { tool: "alignObjects" };
    }

    const minLeft = Math.min(...selectedObjects.map((objectItem) => objectItem.x));
    const maxRight = Math.max(
      ...selectedObjects.map((objectItem) => objectItem.x + objectItem.width),
    );
    const minTop = Math.min(...selectedObjects.map((objectItem) => objectItem.y));
    const maxBottom = Math.max(
      ...selectedObjects.map((objectItem) => objectItem.y + objectItem.height),
    );
    const centerX = (minLeft + maxRight) / 2;
    const centerY = (minTop + maxBottom) / 2;

    const updates = selectedObjects.map((objectItem) => {
      if (args.alignment === "left") {
        return {
          objectId: objectItem.id,
          payload: { x: minLeft },
        };
      }

      if (args.alignment === "center") {
        return {
          objectId: objectItem.id,
          payload: {
            x: centerX - objectItem.width / 2,
          },
        };
      }

      if (args.alignment === "right") {
        return {
          objectId: objectItem.id,
          payload: {
            x: maxRight - objectItem.width,
          },
        };
      }

      if (args.alignment === "top") {
        return {
          objectId: objectItem.id,
          payload: { y: minTop },
        };
      }

      if (args.alignment === "middle") {
        return {
          objectId: objectItem.id,
          payload: {
            y: centerY - objectItem.height / 2,
          },
        };
      }

      return {
        objectId: objectItem.id,
        payload: {
          y: maxBottom - objectItem.height,
        },
      };
    });
    await this.updateObjectsInBatch(updates);

    return { tool: "alignObjects" };
  }

    async distributeObjects(args: {
    objectIds: string[];
    axis: "horizontal" | "vertical";
    viewportBounds?: ViewportBounds;
  }): Promise<ExecuteToolResult> {
    const selectedObjects = await this.resolveSelectedObjects(args.objectIds);
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
        ? (args.viewportBounds?.left ?? 0) +
          (args.viewportBounds?.width ?? 0) -
          last.width / 2
        : hasViewportBounds && args.axis === "vertical"
          ? (args.viewportBounds?.top ?? 0) +
            (args.viewportBounds?.height ?? 0) -
            last.height / 2
          : args.axis === "horizontal"
            ? lastCenter.x
            : lastCenter.y;
    const span = spanEnd - spanStart;
    const step = span / (sortedObjects.length - 1);
    const shouldMoveEndpoints = hasViewportBounds && spanEnd > spanStart;

    const updates: Array<{
      objectId: string;
      payload: UpdateObjectPayload;
    }> = [];
    const startIndex = shouldMoveEndpoints ? 0 : 1;
    const endIndex = shouldMoveEndpoints
      ? sortedObjects.length
      : sortedObjects.length - 1;
    for (let index = startIndex; index < endIndex; index += 1) {
      const objectItem = sortedObjects[index];
      const nextCenter =
        spanStart + step * index;

      updates.push(
        args.axis === "horizontal"
          ? {
              objectId: objectItem.id,
              payload: {
                x: nextCenter - objectItem.width / 2,
              },
            }
          : {
              objectId: objectItem.id,
              payload: {
                y: nextCenter - objectItem.height / 2,
              },
            },
      );
    }
    await this.updateObjectsInBatch(updates);

    return { tool: "distributeObjects" };
  }

    async moveObjects(args: {
    objectIds: string[];
    delta?: {
      dx: number;
      dy: number;
    };
    toPoint?: {
      x: number;
      y: number;
    };
    toViewportSide?: {
      side: "left" | "right" | "top" | "bottom";
      viewportBounds?: ViewportBounds;
      padding?: number;
    };
  }): Promise<ExecuteToolResult> {
    const selectedObjects = await this.resolveSelectedObjects(args.objectIds);
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
      const targetBounds = this.getTargetAreaBounds(
        args.toViewportSide.viewportBounds,
      );
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
      const groupHeight = Math.max(
        1,
        selectedBounds.bottom - selectedBounds.top,
      );
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
        args.toViewportSide.side === "left" ||
        args.toViewportSide.side === "right";

      if (isLeftOrRight) {
        const ordered = [...selectedObjects].sort(
          (first, second) =>
            (first.y - second.y) || (first.x - second.x),
        );
        const totalHeight =
          ordered.reduce((sum, objectItem) => sum + objectItem.height, 0) +
          Math.max(0, ordered.length - 1) * VIEWPORT_SIDE_STACK_GAP;
        const stackHeightMaxTop = Math.max(minTop, targetBounds.bottom - totalHeight);
        const startTop = Math.min(
          stackHeightMaxTop,
          Math.max(minTop, targetTop),
        );
        let yCursor = startTop;
        ordered.forEach((objectItem) => {
          objectItem.x = targetLeft;
          objectItem.y = yCursor;
          yCursor += objectItem.height + VIEWPORT_SIDE_STACK_GAP;
        });
      } else {
        const ordered = [...selectedObjects].sort(
          (first, second) =>
            (first.x - second.x) || (first.y - second.y),
        );
        const totalWidth =
          ordered.reduce((sum, objectItem) => sum + objectItem.width, 0) +
          Math.max(0, ordered.length - 1) * VIEWPORT_SIDE_STACK_GAP;
        const maxLeft = targetBounds.right - totalWidth;
        const startLeft = Math.min(
          maxLeft,
          Math.max(minLeft, targetLeft),
        );
        let xCursor = startLeft;
        ordered.forEach((objectItem) => {
          objectItem.x = xCursor;
          objectItem.y = targetTop;
          xCursor += objectItem.width + VIEWPORT_SIDE_STACK_GAP;
        });
      }

      return await this.updateObjectsInBatch(
        selectedObjects.map((objectItem) => ({
          objectId: objectItem.id,
          payload: {
            x: objectItem.x,
            y: objectItem.y,
          },
        })),
      ).then(() => ({ tool: "moveObjects" }));
    } else if (args.delta) {
      dx = args.delta.dx;
      dy = args.delta.dy;
    } else {
      return { tool: "moveObjects" };
    }

    const updates = selectedObjects.map((objectItem) => ({
      objectId: objectItem.id,
      payload: {
        x: objectItem.x + dx,
        y: objectItem.y + dy,
      },
    }));
    await this.updateObjectsInBatch(updates);

    return { tool: "moveObjects" };
  }

    async moveObject(args: {
    objectId: string;
    x: number;
    y: number;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      x: args.x,
      y: args.y,
    });

    return { tool: "moveObject", objectId: args.objectId };
  }

    async resizeObject(args: {
    objectId: string;
    width: number;
    height: number;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      width: Math.max(1, args.width),
      height: Math.max(1, args.height),
    });

    return { tool: "resizeObject", objectId: args.objectId };
  }

    async updateText(args: {
    objectId: string;
    newText: string;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      text: args.newText.slice(0, 1_000),
    });

    return { tool: "updateText", objectId: args.objectId };
  }

    async changeColor(args: {
    objectId: string;
    color: string;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      color: args.color,
    });

    return { tool: "changeColor", objectId: args.objectId };
  }

    async deleteObjects(args: {
    objectIds: string[];
  }): Promise<ExecuteToolResult> {
    await this.ensureLoadedObjects();

    const uniqueObjectIds = Array.from(
      new Set(args.objectIds.map((value) => value.trim())),
    ).filter((value) => value.length > 0);
    const existingObjectIds = uniqueObjectIds.filter((objectId) =>
      this.objectsById.has(objectId),
    );

    if (existingObjectIds.length === 0) {
      return { tool: "deleteObjects", deletedCount: 0 };
    }

    for (
      let index = 0;
      index < existingObjectIds.length;
      index += DELETE_BATCH_CHUNK_SIZE
    ) {
      const chunk = existingObjectIds.slice(
        index,
        index + DELETE_BATCH_CHUNK_SIZE,
      );
      const batch = this.db.batch();
      chunk.forEach((objectId) => {
        batch.delete(this.objectsCollection.doc(objectId));
      });
      await batch.commit();
    }

    existingObjectIds.forEach((objectId) => {
      this.objectsById.delete(objectId);
    });

    return { tool: "deleteObjects", deletedCount: existingObjectIds.length };
  }

    async fitFrameToContents(args: {
    frameId: string;
    padding?: number;
  }): Promise<ExecuteToolResult> {
    await this.ensureLoadedObjects();
    const frame = this.objectsById.get(args.frameId);
    if (!frame) {
      throw new Error(`Frame not found: ${args.frameId}`);
    }

    const frameBounds = toObjectBounds(frame);
    const contentObjects = Array.from(this.objectsById.values()).filter(
      (objectItem) =>
        objectItem.id !== frame.id &&
        boundsOverlap(toObjectBounds(objectItem), frameBounds),
    );
    const contentBounds = toCombinedBounds(contentObjects);
    if (!contentBounds) {
      return { tool: "fitFrameToContents", objectId: frame.id };
    }

    const padding = toGridDimension(
      args.padding,
      FRAME_FIT_DEFAULT_PADDING,
      FRAME_FIT_MIN_PADDING,
      FRAME_FIT_MAX_PADDING,
    );

    await this.updateObject(frame.id, {
      x: contentBounds.left - padding,
      y: contentBounds.top - padding,
      width: Math.max(
        180,
        contentBounds.right - contentBounds.left + padding * 2,
      ),
      height: Math.max(
        120,
        contentBounds.bottom - contentBounds.top + padding * 2,
      ),
    });

    return { tool: "fitFrameToContents", objectId: frame.id };
  }

    async executeToolCall(toolCall: BoardToolCall): Promise<ExecuteToolResult> {
    switch (toolCall.tool) {
      case "getBoardState":
        await this.getBoardState();
        return { tool: "getBoardState" };
      case "createStickyNote":
        return this.createStickyNote(toolCall.args);
      case "createStickyBatch":
        return this.createStickyBatch(toolCall.args);
      case "createShape":
        return this.createShape(toolCall.args);
      case "createShapeBatch":
        return this.createShapeBatch(toolCall.args);
      case "createGridContainer":
        return this.createGridContainer(toolCall.args);
      case "createFrame":
        return this.createFrame(toolCall.args);
      case "createConnector":
        return this.createConnector(toolCall.args);
      case "arrangeObjectsInGrid":
        return this.arrangeObjectsInGrid(toolCall.args);
      case "alignObjects":
        return this.alignObjects(toolCall.args);
      case "distributeObjects":
        return this.distributeObjects(toolCall.args);
      case "moveObjects":
        return this.moveObjects(toolCall.args);
      case "moveObject":
        return this.moveObject(toolCall.args);
      case "resizeObject":
        return this.resizeObject(toolCall.args);
      case "updateText":
        return this.updateText(toolCall.args);
      case "changeColor":
        return this.changeColor(toolCall.args);
      case "deleteObjects":
        return this.deleteObjects(toolCall.args);
      case "fitFrameToContents":
        return this.fitFrameToContents(toolCall.args);
      default: {
        const exhaustiveCheck: never = toolCall;
        throw new Error(
          `Unsupported tool call: ${JSON.stringify(exhaustiveCheck)}`,
        );
      }
    }
  }

    async executeTemplatePlan(plan: TemplatePlan): Promise<{
    results: ExecuteToolResult[];
    createdObjectIds: string[];
  }> {
    const results: ExecuteToolResult[] = [];
    const createdObjectIds: string[] = [];

    for (const operation of plan.operations) {
      const result = await this.executeToolCall(operation);
      results.push(result);
      if (
        result.objectId &&
        (operation.tool === "createStickyNote" ||
          operation.tool === "createShape" ||
          operation.tool === "createGridContainer" ||
          operation.tool === "createFrame" ||
          operation.tool === "createConnector")
      ) {
        createdObjectIds.push(result.objectId);
      }
      if (
        (operation.tool === "createStickyBatch" ||
          operation.tool === "createShapeBatch") &&
        result.createdObjectIds &&
        result.createdObjectIds.length > 0
      ) {
        createdObjectIds.push(...result.createdObjectIds);
      }
    }

    return {
      results,
      createdObjectIds,
    };
  }
}
