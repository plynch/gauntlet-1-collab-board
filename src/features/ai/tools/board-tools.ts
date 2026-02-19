import {
  FieldValue,
  Timestamp,
  type Firestore,
} from "firebase-admin/firestore";

import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  TemplatePlan,
} from "@/features/ai/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

type ExecuteToolResult = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  deletedCount?: number;
};

const DELETE_BATCH_CHUNK_SIZE = 400;
const GRID_MIN_ROWS = 1;
const GRID_MAX_ROWS = 8;
const GRID_MIN_COLS = 1;
const GRID_MAX_COLS = 8;
const GRID_MIN_GAP = 0;
const GRID_MAX_GAP = 80;
const GRID_DEFAULT_GAP = 2;

type BoardToolExecutorOptions = {
  boardId: string;
  userId: string;
  db?: Firestore;
};

type BoardObjectDoc = {
  type: BoardObjectToolKind;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
  gridRows?: number | null;
  gridCols?: number | null;
  gridGap?: number | null;
  gridCellColors?: string[] | null;
  containerTitle?: string | null;
  gridSectionTitles?: string[] | null;
  gridSectionNotes?: string[] | null;
  updatedAt: string | null;
};

/**
 * Handles to number.
 */
function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Handles to string value.
 */
function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Handles to nullable finite number.
 */
function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Handles to grid dimension.
 */
function toGridDimension(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Math.floor(toNumber(value, fallback));
  return Math.max(minimum, Math.min(maximum, parsed));
}

/**
 * Handles to grid cell colors.
 */
function toGridCellColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value.filter(
    (item): item is string => typeof item === "string",
  );
  return colors.length > 0 ? colors : null;
}

/**
 * Handles to string array.
 */
function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());

  return values.length > 0 ? values : null;
}

/**
 * Handles to optional string.
 */
function toOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

/**
 * Handles normalize section values.
 */
function normalizeSectionValues(
  values: string[] | null,
  expectedCount: number,
  fallback: (index: number) => string,
  maxLength: number,
): string[] {
  return Array.from({ length: expectedCount }, (_, index) => {
    const candidate = values?.[index]?.trim() ?? "";
    if (candidate.length === 0) {
      return fallback(index).slice(0, maxLength);
    }

    return candidate.slice(0, maxLength);
  });
}

/**
 * Returns whether object kind is true.
 */
function isObjectKind(value: unknown): value is BoardObjectToolKind {
  return (
    value === "sticky" ||
    value === "rect" ||
    value === "circle" ||
    value === "gridContainer" ||
    value === "line" ||
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional" ||
    value === "triangle" ||
    value === "star"
  );
}

/**
 * Returns whether connector type is true.
 */
function isConnectorType(value: BoardObjectToolKind): boolean {
  return (
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional"
  );
}

/**
 * Handles to anchor point.
 */
function toAnchorPoint(
  objectItem: BoardObjectSnapshot,
  anchor: "top" | "right" | "bottom" | "left",
): { x: number; y: number } {
  if (anchor === "top") {
    return {
      x: objectItem.x + objectItem.width / 2,
      y: objectItem.y,
    };
  }

  if (anchor === "right") {
    return {
      x: objectItem.x + objectItem.width,
      y: objectItem.y + objectItem.height / 2,
    };
  }

  if (anchor === "bottom") {
    return {
      x: objectItem.x + objectItem.width / 2,
      y: objectItem.y + objectItem.height,
    };
  }

  return {
    x: objectItem.x,
    y: objectItem.y + objectItem.height / 2,
  };
}

/**
 * Handles pick anchors by direction.
 */
function pickAnchorsByDirection(
  fromObject: BoardObjectSnapshot,
  toObject: BoardObjectSnapshot,
): {
  fromAnchor: "top" | "right" | "bottom" | "left";
  toAnchor: "top" | "right" | "bottom" | "left";
} {
  const fromCenter = toObjectCenter(fromObject);
  const toCenter = toObjectCenter(toObject);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { fromAnchor: "right", toAnchor: "left" }
      : { fromAnchor: "left", toAnchor: "right" };
  }

  return dy >= 0
    ? { fromAnchor: "bottom", toAnchor: "top" }
    : { fromAnchor: "top", toAnchor: "bottom" };
}

/**
 * Handles timestamp to iso.
 */
function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

/**
 * Handles to board object doc.
 */
function toBoardObjectDoc(
  id: string,
  raw: Record<string, unknown>,
): BoardObjectSnapshot | null {
  const type = raw.type;
  if (!isObjectKind(type)) {
    return null;
  }

  return {
    id,
    type,
    zIndex: toNumber(raw.zIndex, 0),
    x: toNumber(raw.x, 0),
    y: toNumber(raw.y, 0),
    width: Math.max(1, toNumber(raw.width, 120)),
    height: Math.max(1, toNumber(raw.height, 120)),
    rotationDeg: toNumber(raw.rotationDeg, 0),
    color: toStringValue(raw.color, "#93c5fd"),
    text: toStringValue(raw.text, ""),
    gridRows: toNullableFiniteNumber(raw.gridRows),
    gridCols: toNullableFiniteNumber(raw.gridCols),
    gridGap: toNullableFiniteNumber(raw.gridGap),
    gridCellColors: toGridCellColors(raw.gridCellColors),
    containerTitle: toOptionalString(raw.containerTitle, 120),
    gridSectionTitles: toStringArray(raw.gridSectionTitles),
    gridSectionNotes: toStringArray(raw.gridSectionNotes),
    updatedAt: timestampToIso(raw.updatedAt),
  };
}

/**
 * Handles to object center.
 */
function toObjectCenter(objectItem: BoardObjectSnapshot): {
  x: number;
  y: number;
} {
  return {
    x: objectItem.x + objectItem.width / 2,
    y: objectItem.y + objectItem.height / 2,
  };
}

export class BoardToolExecutor {
  private readonly boardId: string;
  private readonly userId: string;
  private readonly db: Firestore;
  private readonly objectsById = new Map<string, BoardObjectSnapshot>();
  private hasLoadedObjects = false;
  private nextZIndex = 1;

  /**
   * Initializes this class instance.
   */
  constructor(options: BoardToolExecutorOptions) {
    this.boardId = options.boardId;
    this.userId = options.userId;
    this.db = options.db ?? getFirebaseAdminDb();
  }

  private get objectsCollection() {
    return this.db.collection("boards").doc(this.boardId).collection("objects");
  }

  /**
   * Handles ensure loaded objects.
   */
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

  /**
   * Gets board state.
   */
  async getBoardState(): Promise<BoardObjectSnapshot[]> {
    await this.ensureLoadedObjects();
    return Array.from(this.objectsById.values()).sort(
      (left, right) => left.zIndex - right.zIndex,
    );
  }

  /**
   * Creates object.
   */
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
      zIndex: this.nextZIndex++,
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

  /**
   * Handles update object.
   */
  private async updateObject(
    objectId: string,
    payload: Partial<
      Pick<BoardObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">
    >,
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

  /**
   * Creates sticky note.
   */
  async createStickyNote(args: {
    text: string;
    x: number;
    y: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    const created = await this.createObject({
      type: "sticky",
      text: args.text.slice(0, 1_000),
      x: args.x,
      y: args.y,
      width: 180,
      height: 140,
      color: args.color,
    });

    return { tool: "createStickyNote", objectId: created.id };
  }

  /**
   * Creates shape.
   */
  async createShape(args: {
    type: BoardObjectToolKind;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    if (
      args.type === "line" ||
      args.type === "gridContainer" ||
      isConnectorType(args.type)
    ) {
      throw new Error("createShape only supports non-connector board shapes.");
    }

    const created = await this.createObject({
      type: args.type,
      x: args.x,
      y: args.y,
      width: Math.max(20, args.width),
      height: Math.max(20, args.height),
      color: args.color,
    });

    return { tool: "createShape", objectId: created.id };
  }

  /**
   * Creates grid container.
   */
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
    const rows = toGridDimension(args.rows, 2, GRID_MIN_ROWS, GRID_MAX_ROWS);
    const cols = toGridDimension(args.cols, 2, GRID_MIN_COLS, GRID_MAX_COLS);
    const sectionCount = rows * cols;
    const sectionTitles = normalizeSectionValues(
      toStringArray(args.sectionTitles),
      sectionCount,
      (index) => `Section ${index + 1}`,
      80,
    );
    const sectionNotes = normalizeSectionValues(
      toStringArray(args.sectionNotes),
      sectionCount,
      () => "",
      600,
    );
    const containerTitle =
      toOptionalString(args.containerTitle, 120) ?? "Grid container";

    const created = await this.createObject({
      type: "gridContainer",
      x: args.x,
      y: args.y,
      width: Math.max(120, args.width),
      height: Math.max(100, args.height),
      color: "#e2e8f0",
      gridRows: rows,
      gridCols: cols,
      gridGap: toGridDimension(
        args.gap,
        GRID_DEFAULT_GAP,
        GRID_MIN_GAP,
        GRID_MAX_GAP,
      ),
      gridCellColors: toGridCellColors(args.cellColors) ?? undefined,
      containerTitle,
      gridSectionTitles: sectionTitles,
      gridSectionNotes: sectionNotes,
    });

    return { tool: "createGridContainer", objectId: created.id };
  }

  /**
   * Creates frame.
   */
  async createFrame(args: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<ExecuteToolResult> {
    const created = await this.createObject({
      type: "rect",
      text: args.title.slice(0, 200),
      x: args.x,
      y: args.y,
      width: Math.max(180, args.width),
      height: Math.max(120, args.height),
      color: "#e2e8f0",
    });

    return { tool: "createFrame", objectId: created.id };
  }

  /**
   * Creates connector.
   */
  async createConnector(args: {
    fromId: string;
    toId: string;
    style: "undirected" | "one-way-arrow" | "two-way-arrow";
  }): Promise<ExecuteToolResult> {
    await this.ensureLoadedObjects();
    const fromObject = this.objectsById.get(args.fromId);
    const toObject = this.objectsById.get(args.toId);

    if (!fromObject || !toObject) {
      throw new Error("Connector endpoints were not found.");
    }

    if (
      fromObject.type === "line" ||
      toObject.type === "line" ||
      isConnectorType(fromObject.type) ||
      isConnectorType(toObject.type)
    ) {
      throw new Error("Connectors must link two non-connector shapes.");
    }

    const { fromAnchor, toAnchor } = pickAnchorsByDirection(
      fromObject,
      toObject,
    );
    const fromPoint = toAnchorPoint(fromObject, fromAnchor);
    const toPoint = toAnchorPoint(toObject, toAnchor);
    const x = Math.min(fromPoint.x, toPoint.x);
    const y = Math.min(fromPoint.y, toPoint.y);
    const width = Math.max(12, Math.abs(toPoint.x - fromPoint.x));
    const height = Math.max(12, Math.abs(toPoint.y - fromPoint.y));
    const type: BoardObjectToolKind =
      args.style === "one-way-arrow"
        ? "connectorArrow"
        : args.style === "two-way-arrow"
          ? "connectorBidirectional"
          : "connectorUndirected";
    const color =
      args.style === "one-way-arrow"
        ? "#1d4ed8"
        : args.style === "two-way-arrow"
          ? "#0f766e"
          : "#334155";

    await this.ensureLoadedObjects();
    const payload = {
      type,
      zIndex: this.nextZIndex++,
      x,
      y,
      width,
      height,
      rotationDeg: 0,
      color,
      text: "",
      fromObjectId: fromObject.id,
      toObjectId: toObject.id,
      fromAnchor,
      toAnchor,
      fromX: fromPoint.x,
      fromY: fromPoint.y,
      toX: toPoint.x,
      toY: toPoint.y,
      createdBy: this.userId,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    const createdRef = await this.objectsCollection.add(payload);
    const created: BoardObjectSnapshot = {
      id: createdRef.id,
      type: payload.type,
      zIndex: payload.zIndex,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      rotationDeg: payload.rotationDeg,
      color: payload.color,
      text: payload.text,
      updatedAt: null,
    };
    this.objectsById.set(created.id, created);

    return { tool: "createConnector", objectId: created.id };
  }

  /**
   * Handles move object.
   */
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

  /**
   * Handles resize object.
   */
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

  /**
   * Handles update text.
   */
  async updateText(args: {
    objectId: string;
    newText: string;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      text: args.newText.slice(0, 1_000),
    });

    return { tool: "updateText", objectId: args.objectId };
  }

  /**
   * Handles change color.
   */
  async changeColor(args: {
    objectId: string;
    color: string;
  }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      color: args.color,
    });

    return { tool: "changeColor", objectId: args.objectId };
  }

  /**
   * Handles delete objects.
   */
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

  /**
   * Handles execute tool call.
   */
  async executeToolCall(toolCall: BoardToolCall): Promise<ExecuteToolResult> {
    switch (toolCall.tool) {
      case "getBoardState":
        await this.getBoardState();
        return { tool: "getBoardState" };
      case "createStickyNote":
        return this.createStickyNote(toolCall.args);
      case "createShape":
        return this.createShape(toolCall.args);
      case "createGridContainer":
        return this.createGridContainer(toolCall.args);
      case "createFrame":
        return this.createFrame(toolCall.args);
      case "createConnector":
        return this.createConnector(toolCall.args);
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
      default: {
        const exhaustiveCheck: never = toolCall;
        throw new Error(
          `Unsupported tool call: ${JSON.stringify(exhaustiveCheck)}`,
        );
      }
    }
  }

  /**
   * Handles execute template plan.
   */
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
    }

    return {
      results,
      createdObjectIds,
    };
  }
}
