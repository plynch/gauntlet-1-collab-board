import { FieldValue, type CollectionReference, type Firestore } from "firebase-admin/firestore";

import type { BoardObjectSnapshot, BoardObjectToolKind, ViewportBounds } from "@/features/ai/types";
import { DELETE_BATCH_CHUNK_SIZE, type BoardToolExecutorOptions } from "@/features/ai/tools/board-tools/constants";
import { isBackgroundContainerType, toBoardObjectDoc, toCombinedBounds, type UpdateObjectPayload } from "@/features/ai/tools/board-tools/object-utils";
import { toGridCellColors, toNullableFiniteNumber, toOptionalString, toStringArray } from "@/features/ai/tools/board-tools/value-utils";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

export type BoardExecutorState = {
  boardId: string;
  userId: string;
  db: Firestore;
  objectsById: Map<string, BoardObjectSnapshot>;
  hasLoadedObjects: boolean;
  nextZIndex: number;
};

export type CreateObjectInput = {
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

export function createBoardExecutorState(options: BoardToolExecutorOptions): BoardExecutorState {
  return {
    boardId: options.boardId,
    userId: options.userId,
    db: options.db ?? getFirebaseAdminDb(),
    objectsById: new Map<string, BoardObjectSnapshot>(),
    hasLoadedObjects: false,
    nextZIndex: 1,
  };
}

export function getObjectsCollection(state: BoardExecutorState): CollectionReference {
  return state.db.collection("boards").doc(state.boardId).collection("objects");
}

export async function ensureLoadedObjects(state: BoardExecutorState): Promise<void> {
  if (state.hasLoadedObjects) {
    return;
  }
  const snapshot = await getObjectsCollection(state).get();
  state.objectsById.clear();
  snapshot.docs.forEach((doc) => {
    const parsed = toBoardObjectDoc(doc.id, doc.data() as Record<string, unknown>);
    if (parsed) {
      state.objectsById.set(parsed.id, parsed);
    }
  });
  state.nextZIndex =
    state.objectsById.size > 0
      ? Math.max(...Array.from(state.objectsById.values()).map((item) => item.zIndex)) + 1
      : 1;
  state.hasLoadedObjects = true;
}

export async function getBoardState(state: BoardExecutorState): Promise<BoardObjectSnapshot[]> {
  await ensureLoadedObjects(state);
  return Array.from(state.objectsById.values()).sort(
    (left, right) => left.zIndex - right.zIndex,
  );
}

function getNextZIndexForType(state: BoardExecutorState, type: BoardObjectToolKind): number {
  if (!isBackgroundContainerType(type)) {
    const value = state.nextZIndex;
    state.nextZIndex += 1;
    return value;
  }
  const lowestZIndex = Array.from(state.objectsById.values()).reduce(
    (minimum, objectItem) => Math.min(minimum, objectItem.zIndex),
    0,
  );
  return lowestZIndex - 1;
}

export async function createObject(
  state: BoardExecutorState,
  options: CreateObjectInput,
): Promise<BoardObjectSnapshot> {
  await ensureLoadedObjects(state);
  const payload: Record<string, unknown> = {
    type: options.type,
    zIndex: getNextZIndexForType(state, options.type),
    x: options.x,
    y: options.y,
    width: Math.max(1, options.width),
    height: Math.max(1, options.height),
    rotationDeg: options.rotationDeg ?? 0,
    color: options.color,
    text: options.text ?? "",
    createdBy: state.userId,
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
  if (typeof options.containerTitle === "string" && options.containerTitle.trim().length > 0) {
    payload.containerTitle = options.containerTitle.trim().slice(0, 120);
  }
  if (options.gridSectionTitles && options.gridSectionTitles.length > 0) {
    payload.gridSectionTitles = options.gridSectionTitles.map((title) => title.slice(0, 80));
  }
  if (options.gridSectionNotes && options.gridSectionNotes.length > 0) {
    payload.gridSectionNotes = options.gridSectionNotes.map((note) => note.slice(0, 600));
  }
  const created = await getObjectsCollection(state).add(payload);
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
  state.objectsById.set(snapshot.id, snapshot);
  return snapshot;
}

export async function updateObject(
  state: BoardExecutorState,
  objectId: string,
  payload: UpdateObjectPayload,
): Promise<void> {
  await ensureLoadedObjects(state);
  const existing = state.objectsById.get(objectId);
  if (!existing) {
    throw new Error(`Object not found: ${objectId}`);
  }
  await getObjectsCollection(state).doc(objectId).update({
    ...payload,
    updatedAt: FieldValue.serverTimestamp(),
  });
  state.objectsById.set(objectId, {
    ...existing,
    ...payload,
  });
}

export async function updateObjectsInBatch(
  state: BoardExecutorState,
  updates: Array<{ objectId: string; payload: UpdateObjectPayload }>,
): Promise<void> {
  await ensureLoadedObjects(state);
  const normalizedUpdates = updates.filter((update) => state.objectsById.has(update.objectId));
  if (normalizedUpdates.length === 0) {
    return;
  }
  const objectsCollection = getObjectsCollection(state);
  for (let index = 0; index < normalizedUpdates.length; index += DELETE_BATCH_CHUNK_SIZE) {
    const chunk = normalizedUpdates.slice(index, index + DELETE_BATCH_CHUNK_SIZE);
    const batch = state.db.batch();
    chunk.forEach((entry) => {
      batch.update(objectsCollection.doc(entry.objectId), {
        ...entry.payload,
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
    await batch.commit();
  }
  normalizedUpdates.forEach((entry) => {
    const existing = state.objectsById.get(entry.objectId);
    if (!existing) {
      return;
    }
    state.objectsById.set(entry.objectId, { ...existing, ...entry.payload });
  });
}

export function getTargetAreaBounds(
  state: BoardExecutorState,
  viewportBounds?: ViewportBounds,
): { left: number; right: number; top: number; bottom: number } | null {
  if (viewportBounds) {
    return {
      left: viewportBounds.left,
      right: viewportBounds.left + viewportBounds.width,
      top: viewportBounds.top,
      bottom: viewportBounds.top + viewportBounds.height,
    };
  }
  return toCombinedBounds(Array.from(state.objectsById.values()));
}

export async function resolveSelectedObjects(
  state: BoardExecutorState,
  objectIds: string[],
): Promise<BoardObjectSnapshot[]> {
  await ensureLoadedObjects(state);
  const uniqueObjectIds = Array.from(new Set(objectIds.map((value) => value.trim())))
    .filter((value) => value.length > 0);
  return uniqueObjectIds
    .map((objectId) => state.objectsById.get(objectId))
    .filter((objectItem): objectItem is BoardObjectSnapshot => Boolean(objectItem));
}

export function sortObjectsByPosition(objects: BoardObjectSnapshot[]): BoardObjectSnapshot[] {
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
