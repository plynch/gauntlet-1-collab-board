import { FieldValue, type CollectionReference } from "firebase-admin/firestore";

import type { BoardObjectSnapshot, BoardObjectToolKind, BoardToolCall } from "@/features/ai/types";
import {
  GRID_DEFAULT_GAP,
  GRID_MAX_COLS,
  GRID_MAX_GAP,
  GRID_MAX_ROWS,
  GRID_MIN_COLS,
  GRID_MIN_GAP,
  GRID_MIN_ROWS,
} from "@/features/ai/tools/board-tools/constants";
import {
  isConnectorType,
  pickAnchorsByDirection,
  toAnchorPoint,
} from "@/features/ai/tools/board-tools/object-utils";
import {
  normalizeSectionValues,
  toGridCellColors,
  toGridDimension,
  toOptionalString,
  toStringArray,
} from "@/features/ai/tools/board-tools/value-utils";

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

type ContainerConnectorContext = {
  ensureLoadedObjects: () => Promise<void>;
  createObject: (options: CreateObjectInput) => Promise<BoardObjectSnapshot>;
  objectsById: Map<string, BoardObjectSnapshot>;
  objectsCollection: CollectionReference;
  userId: string;
  allocateZIndex: () => number;
};

export async function createGridContainerTool(
  context: ContainerConnectorContext,
  args: {
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
  },
): Promise<ExecuteToolResultLike> {
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

  const created = await context.createObject({
    type: "gridContainer",
    x: args.x,
    y: args.y,
    width: Math.max(120, args.width),
    height: Math.max(100, args.height),
    color: "#e2e8f0",
    gridRows: rows,
    gridCols: cols,
    gridGap: toGridDimension(args.gap, GRID_DEFAULT_GAP, GRID_MIN_GAP, GRID_MAX_GAP),
    gridCellColors: toGridCellColors(args.cellColors) ?? undefined,
    containerTitle,
    gridSectionTitles: sectionTitles,
    gridSectionNotes: sectionNotes,
  });

  return { tool: "createGridContainer", objectId: created.id };
}

export async function createFrameTool(
  context: ContainerConnectorContext,
  args: {
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
): Promise<ExecuteToolResultLike> {
  const normalizedTitle = args.title.trim().slice(0, 200);
  const created = await context.createObject({
    type: "rect",
    x: args.x,
    y: args.y,
    width: Math.max(180, args.width),
    height: Math.max(120, args.height),
    color: "transparent",
    text: normalizedTitle,
    containerTitle: "__frame__",
  });

  return { tool: "createFrame", objectId: created.id };
}

export async function createConnectorTool(
  context: ContainerConnectorContext,
  args: {
    fromId: string;
    toId: string;
    style: "undirected" | "one-way-arrow" | "two-way-arrow";
  },
): Promise<ExecuteToolResultLike> {
  await context.ensureLoadedObjects();
  const fromObject = context.objectsById.get(args.fromId);
  const toObject = context.objectsById.get(args.toId);
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

  const { fromAnchor, toAnchor } = pickAnchorsByDirection(fromObject, toObject);
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

  const payload = {
    type,
    zIndex: context.allocateZIndex(),
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
    createdBy: context.userId,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const createdRef = await context.objectsCollection.add(payload);
  context.objectsById.set(createdRef.id, {
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
  });

  return { tool: "createConnector", objectId: createdRef.id };
}
