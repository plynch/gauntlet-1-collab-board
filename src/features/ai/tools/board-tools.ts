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
  ViewportBounds,
} from "@/features/ai/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

type ExecuteToolResult = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
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
const LAYOUT_GRID_MIN_COLUMNS = 1;
const LAYOUT_GRID_MAX_COLUMNS = 8;
const LAYOUT_GRID_DEFAULT_COLUMNS = 3;
const LAYOUT_GRID_MIN_GAP = 0;
const LAYOUT_GRID_MAX_GAP = 400;
const LAYOUT_GRID_DEFAULT_GAP = 32;
const STICKY_BATCH_MIN_COUNT = 1;
const STICKY_BATCH_MAX_COUNT = 50;
const STICKY_BATCH_DEFAULT_COLUMNS = 5;
const STICKY_BATCH_MIN_COLUMNS = 1;
const STICKY_BATCH_MAX_COLUMNS = 10;
const STICKY_BATCH_DEFAULT_GAP_X = 240;
const STICKY_BATCH_DEFAULT_GAP_Y = 190;
const SHAPE_BATCH_MIN_COUNT = 1;
const SHAPE_BATCH_MAX_COUNT = 50;
const SHAPE_BATCH_MIN_COLUMNS = 1;
const SHAPE_BATCH_MAX_COLUMNS = 8;
const SHAPE_BATCH_DEFAULT_WIDTH = 220;
const SHAPE_BATCH_DEFAULT_HEIGHT = 160;
const SHAPE_BATCH_MIN_GAP = 0;
const SHAPE_BATCH_MAX_GAP = 400;
const STICKY_DEFAULT_COLOR = "#fde68a";
const STICKY_PALETTE_COLORS = [
  "#fde68a",
  "#fdba74",
  "#fca5a5",
  "#f9a8d4",
  "#c4b5fd",
  "#93c5fd",
  "#99f6e4",
  "#86efac",
  "#d1d5db",
  "#d2b48c",
] as const;
const COLOR_KEYWORD_HEX: Record<string, string> = {
  yellow: "#fde68a",
  orange: "#fdba74",
  red: "#fca5a5",
  pink: "#f9a8d4",
  purple: "#c4b5fd",
  blue: "#93c5fd",
  teal: "#99f6e4",
  green: "#86efac",
  gray: "#d1d5db",
  grey: "#d1d5db",
  tan: "#d2b48c",
  black: "#1f2937",
  white: "#ffffff",
};
const MOVE_OBJECTS_MIN_PADDING = 0;
const MOVE_OBJECTS_MAX_PADDING = 400;
const MOVE_OBJECTS_DEFAULT_PADDING = 0;
const FRAME_FIT_MIN_PADDING = 0;
const FRAME_FIT_MAX_PADDING = 240;
const FRAME_FIT_DEFAULT_PADDING = 40;
const VIEWPORT_SIDE_STACK_GAP = 32;

type LayoutAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

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

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toGridDimension(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Math.floor(toNumber(value, fallback));
  return Math.max(minimum, Math.min(maximum, parsed));
}

function toGridCellColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value.filter(
    (item): item is string => typeof item === "string",
  );
  return colors.length > 0 ? colors : null;
}

function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());

  return values.length > 0 ? values : null;
}

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

function expandHexColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const shortHexMatch = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function parseColorRgb(value: string): { r: number; g: number; b: number } | null {
  const namedHex = COLOR_KEYWORD_HEX[value.trim().toLowerCase()];
  const hex = expandHexColor(namedHex ?? value);
  if (!hex) {
    return null;
  }

  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  return { r, g, b };
}

function isBrightYellowLike(rgb: { r: number; g: number; b: number }): boolean {
  return rgb.r >= 220 && rgb.g >= 220 && rgb.b <= 120;
}

function toNearestStickyPaletteColor(value: unknown): string {
  if (typeof value !== "string") {
    return STICKY_DEFAULT_COLOR;
  }

  const normalized = value.trim().toLowerCase();
  const exactPaletteMatch = STICKY_PALETTE_COLORS.find(
    (paletteColor) => paletteColor === normalized,
  );
  if (exactPaletteMatch) {
    return exactPaletteMatch;
  }

  const rgb = parseColorRgb(normalized);
  if (!rgb) {
    return STICKY_DEFAULT_COLOR;
  }

  if (isBrightYellowLike(rgb)) {
    return "#fde68a";
  }

  let nearestColor = STICKY_DEFAULT_COLOR;
  let nearestDistance = Number.POSITIVE_INFINITY;

  STICKY_PALETTE_COLORS.forEach((paletteColor) => {
    const paletteRgb = parseColorRgb(paletteColor);
    if (!paletteRgb) {
      return;
    }

    const distance =
      (rgb.r - paletteRgb.r) ** 2 +
      (rgb.g - paletteRgb.g) ** 2 +
      (rgb.b - paletteRgb.b) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestColor = paletteColor;
    }
  });

  return nearestColor;
}

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

function isConnectorType(value: BoardObjectToolKind): boolean {
  return (
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional"
  );
}

function isBackgroundContainerType(value: BoardObjectToolKind): boolean {
  return value === "gridContainer";
}

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

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

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

function toObjectCenter(objectItem: BoardObjectSnapshot): {
  x: number;
  y: number;
} {
  return {
    x: objectItem.x + objectItem.width / 2,
    y: objectItem.y + objectItem.height / 2,
  };
}

function toObjectBounds(objectItem: BoardObjectSnapshot): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: objectItem.x,
    right: objectItem.x + objectItem.width,
    top: objectItem.y,
    bottom: objectItem.y + objectItem.height,
  };
}

function toCombinedBounds(objects: BoardObjectSnapshot[]): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} | null {
  if (objects.length === 0) {
    return null;
  }

  return {
    left: Math.min(...objects.map((objectItem) => objectItem.x)),
    right: Math.max(
      ...objects.map((objectItem) => objectItem.x + objectItem.width),
    ),
    top: Math.min(...objects.map((objectItem) => objectItem.y)),
    bottom: Math.max(
      ...objects.map((objectItem) => objectItem.y + objectItem.height),
    ),
  };
}

function boundsOverlap(
  leftBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
  rightBounds: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  },
): boolean {
  return !(
    leftBounds.right < rightBounds.left ||
    leftBounds.left > rightBounds.right ||
    leftBounds.bottom < rightBounds.top ||
    leftBounds.top > rightBounds.bottom
  );
}

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

    private async updateObjectsInBatch(
    updates: Array<{
      objectId: string;
      payload: Partial<
        Pick<BoardObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">
      >;
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
    const normalizedColor = toNearestStickyPaletteColor(args.color);
    const created = await this.createObject({
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
    await this.ensureLoadedObjects();

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

    for (let index = 0; index < count; index += DELETE_BATCH_CHUNK_SIZE) {
      const chunkCount = Math.min(DELETE_BATCH_CHUNK_SIZE, count - index);
      const batch = this.db.batch();

      for (let offset = 0; offset < chunkCount; offset += 1) {
        const absoluteIndex = index + offset;
        const row = Math.floor(absoluteIndex / columns);
        const column = absoluteIndex % columns;
        const x = args.originX + column * gapX;
        const y = args.originY + row * gapY;
        const stickyText =
          count === 1 ? textPrefix : `${textPrefix} ${absoluteIndex + 1}`;
        const docRef = this.objectsCollection.doc();
        const payload = {
          type: "sticky",
          zIndex: this.nextZIndex++,
          x,
          y,
          width: 180,
          height: 140,
          rotationDeg: 0,
          color: normalizedColor,
          text: stickyText.slice(0, 1_000),
          createdBy: this.userId,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        } satisfies Record<string, unknown>;

        batch.set(docRef, payload);
        this.objectsById.set(docRef.id, {
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

    async createShape(args: {
    type: BoardObjectToolKind;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    if (args.type === "gridContainer" || isConnectorType(args.type)) {
      throw new Error("createShape only supports non-connector board shapes.");
    }

    const minimumWidth = args.type === "line" ? 24 : 20;
    const minimumHeight = args.type === "line" ? 2 : 20;
    const created = await this.createObject({
      type: args.type,
      x: args.x,
      y: args.y,
      width: Math.max(minimumWidth, args.width),
      height: Math.max(minimumHeight, args.height),
      color: args.color,
    });

    return { tool: "createShape", objectId: created.id };
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
    await this.ensureLoadedObjects();

    const count = toGridDimension(
      args.count,
      SHAPE_BATCH_MIN_COUNT,
      SHAPE_BATCH_MIN_COUNT,
      SHAPE_BATCH_MAX_COUNT,
    );
    const columns = toGridDimension(
      args.columns,
      Math.min(SHAPE_BATCH_MAX_COLUMNS, Math.max(SHAPE_BATCH_MIN_COLUMNS, Math.ceil(Math.sqrt(count)))),
      SHAPE_BATCH_MIN_COLUMNS,
      SHAPE_BATCH_MAX_COLUMNS,
    );
    const minimumWidth = args.type === "line" ? 24 : 20;
    const minimumHeight = args.type === "line" ? 2 : 20;
    const width = Math.max(
      minimumWidth,
      toGridDimension(
        args.width,
        SHAPE_BATCH_DEFAULT_WIDTH,
        minimumWidth,
        2_000,
      ),
    );
    const height = Math.max(
      minimumHeight,
      toGridDimension(
        args.height,
        SHAPE_BATCH_DEFAULT_HEIGHT,
        minimumHeight,
        2_000,
      ),
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
      const created = await this.createObject({
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

    async createFrame(args: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }): Promise<ExecuteToolResult> {
    const normalizedTitle = args.title.trim().slice(0, 200) || "Frame";
    const created = await this.createObject({
      type: "gridContainer",
      x: args.x,
      y: args.y,
      width: Math.max(180, args.width),
      height: Math.max(120, args.height),
      color: "#e2e8f0",
      gridRows: 1,
      gridCols: 1,
      gridGap: GRID_DEFAULT_GAP,
      containerTitle: normalizedTitle,
      gridSectionTitles: ["Items"],
      gridSectionNotes: [""],
    });

    return { tool: "createFrame", objectId: created.id };
  }

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
      payload: Partial<
        Pick<BoardObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">
      >;
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
