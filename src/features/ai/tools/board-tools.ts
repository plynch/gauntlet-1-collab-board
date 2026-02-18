import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  TemplatePlan
} from "@/features/ai/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

type ExecuteToolResult = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  deletedCount?: number;
};

const DELETE_BATCH_CHUNK_SIZE = 400;

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
  updatedAt: string | null;
};

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function isObjectKind(value: unknown): value is BoardObjectToolKind {
  return (
    value === "sticky" ||
    value === "rect" ||
    value === "circle" ||
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

function toAnchorPoint(
  objectItem: BoardObjectSnapshot,
  anchor: "top" | "right" | "bottom" | "left"
): { x: number; y: number } {
  if (anchor === "top") {
    return {
      x: objectItem.x + objectItem.width / 2,
      y: objectItem.y
    };
  }

  if (anchor === "right") {
    return {
      x: objectItem.x + objectItem.width,
      y: objectItem.y + objectItem.height / 2
    };
  }

  if (anchor === "bottom") {
    return {
      x: objectItem.x + objectItem.width / 2,
      y: objectItem.y + objectItem.height
    };
  }

  return {
    x: objectItem.x,
    y: objectItem.y + objectItem.height / 2
  };
}

function pickAnchorsByDirection(
  fromObject: BoardObjectSnapshot,
  toObject: BoardObjectSnapshot
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

function toBoardObjectDoc(id: string, raw: Record<string, unknown>): BoardObjectSnapshot | null {
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
    updatedAt: timestampToIso(raw.updatedAt)
  };
}

function toObjectCenter(objectItem: BoardObjectSnapshot): { x: number; y: number } {
  return {
    x: objectItem.x + objectItem.width / 2,
    y: objectItem.y + objectItem.height / 2
  };
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
      const parsed = toBoardObjectDoc(doc.id, doc.data() as Record<string, unknown>);
      if (parsed) {
        this.objectsById.set(parsed.id, parsed);
      }
    });

    this.nextZIndex =
      this.objectsById.size > 0
        ? Math.max(...Array.from(this.objectsById.values()).map((item) => item.zIndex)) + 1
        : 1;
    this.hasLoadedObjects = true;
  }

  async getBoardState(): Promise<BoardObjectSnapshot[]> {
    await this.ensureLoadedObjects();
    return Array.from(this.objectsById.values()).sort((left, right) => left.zIndex - right.zIndex);
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
  }): Promise<BoardObjectSnapshot> {
    await this.ensureLoadedObjects();

    const payload = {
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
      updatedAt: FieldValue.serverTimestamp()
    };

    const created = await this.objectsCollection.add(payload);
    const snapshot: BoardObjectSnapshot = {
      id: created.id,
      type: payload.type,
      zIndex: payload.zIndex,
      x: payload.x,
      y: payload.y,
      width: payload.width,
      height: payload.height,
      rotationDeg: payload.rotationDeg,
      color: payload.color,
      text: payload.text,
      updatedAt: null
    };

    this.objectsById.set(snapshot.id, snapshot);
    return snapshot;
  }

  private async updateObject(
    objectId: string,
    payload: Partial<Pick<BoardObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">>
  ): Promise<void> {
    await this.ensureLoadedObjects();
    const existing = this.objectsById.get(objectId);
    if (!existing) {
      throw new Error(`Object not found: ${objectId}`);
    }

    await this.objectsCollection.doc(objectId).update({
      ...payload,
      updatedAt: FieldValue.serverTimestamp()
    });

    this.objectsById.set(objectId, {
      ...existing,
      ...payload
    });
  }

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
      color: args.color
    });

    return { tool: "createStickyNote", objectId: created.id };
  }

  async createShape(args: {
    type: BoardObjectToolKind;
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
  }): Promise<ExecuteToolResult> {
    if (args.type === "line" || isConnectorType(args.type)) {
      throw new Error("createShape only supports non-connector board shapes.");
    }

    const created = await this.createObject({
      type: args.type,
      x: args.x,
      y: args.y,
      width: Math.max(20, args.width),
      height: Math.max(20, args.height),
      color: args.color
    });

    return { tool: "createShape", objectId: created.id };
  }

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
      color: "#e2e8f0"
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
      updatedAt: FieldValue.serverTimestamp()
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
      updatedAt: null
    };
    this.objectsById.set(created.id, created);

    return { tool: "createConnector", objectId: created.id };
  }

  async moveObject(args: { objectId: string; x: number; y: number }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      x: args.x,
      y: args.y
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
      height: Math.max(1, args.height)
    });

    return { tool: "resizeObject", objectId: args.objectId };
  }

  async updateText(args: { objectId: string; newText: string }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      text: args.newText.slice(0, 1_000)
    });

    return { tool: "updateText", objectId: args.objectId };
  }

  async changeColor(args: { objectId: string; color: string }): Promise<ExecuteToolResult> {
    await this.updateObject(args.objectId, {
      color: args.color
    });

    return { tool: "changeColor", objectId: args.objectId };
  }

  async deleteObjects(args: { objectIds: string[] }): Promise<ExecuteToolResult> {
    await this.ensureLoadedObjects();

    const uniqueObjectIds = Array.from(new Set(args.objectIds.map((value) => value.trim()))).filter(
      (value) => value.length > 0
    );
    const existingObjectIds = uniqueObjectIds.filter((objectId) => this.objectsById.has(objectId));

    if (existingObjectIds.length === 0) {
      return { tool: "deleteObjects", deletedCount: 0 };
    }

    for (let index = 0; index < existingObjectIds.length; index += DELETE_BATCH_CHUNK_SIZE) {
      const chunk = existingObjectIds.slice(index, index + DELETE_BATCH_CHUNK_SIZE);
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

  async executeToolCall(toolCall: BoardToolCall): Promise<ExecuteToolResult> {
    switch (toolCall.tool) {
      case "getBoardState":
        await this.getBoardState();
        return { tool: "getBoardState" };
      case "createStickyNote":
        return this.createStickyNote(toolCall.args);
      case "createShape":
        return this.createShape(toolCall.args);
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
        throw new Error(`Unsupported tool call: ${JSON.stringify(exhaustiveCheck)}`);
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
      if (result.objectId && (operation.tool === "createStickyNote" || operation.tool === "createShape" || operation.tool === "createFrame" || operation.tool === "createConnector")) {
        createdObjectIds.push(result.objectId);
      }
    }

    return {
      results,
      createdObjectIds
    };
  }
}
