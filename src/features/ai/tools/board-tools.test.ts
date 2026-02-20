import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { BoardToolExecutor } from "@/features/ai/tools/board-tools";

type ObjectDoc = {
  type: string;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
};

type UpdatePayload = Partial<
  Pick<ObjectDoc, "x" | "y" | "width" | "height" | "color" | "text">
> & {
  updatedAt?: unknown;
};

class FakeFirestore {
  readonly objects = new Map<string, ObjectDoc>();
  readonly deletedIds: string[] = [];
  batchCommitCount = 0;
  private createdIdCounter = 0;

  /**
   * Initializes this class instance.
   */
  constructor(initialObjects: Array<{ id: string; data: ObjectDoc }>) {
    initialObjects.forEach((entry) => {
      this.objects.set(entry.id, { ...entry.data });
    });
  }

  /**
   * Handles collection.
   */
  collection(name: string) {
    if (name !== "boards") {
      throw new Error(`Unsupported collection: ${name}`);
    }

    return {
      doc: (boardId: string) => {
        void boardId;
        return {
          collection: (subcollectionName: string) => {
            if (subcollectionName !== "objects") {
              throw new Error(
                `Unsupported subcollection: ${subcollectionName}`,
              );
            }

            return {
              get: async () => ({
                docs: Array.from(this.objects.entries()).map(([id, data]) => ({
                  id,
                  data: () => ({ ...data }),
                })),
              }),
              add: async (payload: Record<string, unknown>) => {
                this.createdIdCounter += 1;
                const id = `created-${this.createdIdCounter}`;
                this.objects.set(id, {
                  type: typeof payload.type === "string" ? payload.type : "rect",
                  zIndex:
                    typeof payload.zIndex === "number" ? payload.zIndex : 0,
                  x: typeof payload.x === "number" ? payload.x : 0,
                  y: typeof payload.y === "number" ? payload.y : 0,
                  width: typeof payload.width === "number" ? payload.width : 120,
                  height:
                    typeof payload.height === "number" ? payload.height : 120,
                  rotationDeg:
                    typeof payload.rotationDeg === "number"
                      ? payload.rotationDeg
                      : 0,
                  color:
                    typeof payload.color === "string"
                      ? payload.color
                      : "#93c5fd",
                  text: typeof payload.text === "string" ? payload.text : "",
                });
                return { id };
              },
              doc: (id: string) => ({
                id,
                update: async (payload: UpdatePayload) => {
                  const existing = this.objects.get(id);
                  if (!existing) {
                    throw new Error(`Object not found: ${id}`);
                  }

                  const { updatedAt, ...rest } = payload;
                  void updatedAt;
                  this.objects.set(id, {
                    ...existing,
                    ...rest,
                  });
                },
              }),
            };
          },
        };
      },
    };
  }

  /**
   * Handles batch.
   */
  batch() {
    const pending: string[] = [];

    return {
      delete: (docRef: { id: string }) => {
        pending.push(docRef.id);
      },
      commit: async () => {
        this.batchCommitCount += 1;
        pending.forEach((id) => {
          if (this.objects.delete(id)) {
            this.deletedIds.push(id);
          }
        });
      },
    };
  }
}

/**
 * Creates object.
 */
function createObject(
  id: string,
  zIndex: number,
  overrides: Partial<ObjectDoc> = {},
): { id: string; data: ObjectDoc } {
  return {
    id,
    data: {
      type: "rect",
      zIndex,
      x: 10,
      y: 20,
      width: 120,
      height: 90,
      rotationDeg: 0,
      color: "#93c5fd",
      text: "",
      ...overrides,
    },
  };
}

describe("BoardToolExecutor deleteObjects", () => {
  it("returns zero deleted count when ids are missing", async () => {
    const fakeDb = new FakeFirestore([createObject("obj-1", 1)]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.deleteObjects({
      objectIds: ["missing-1", "missing-2"],
    });

    expect(result.tool).toBe("deleteObjects");
    expect(result.deletedCount).toBe(0);
    expect(fakeDb.batchCommitCount).toBe(0);
  });

  it("deduplicates object ids before deletion", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1),
      createObject("obj-2", 2),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.deleteObjects({
      objectIds: ["obj-1", "obj-1", "obj-2", "", "missing"],
    });

    expect(result.deletedCount).toBe(2);
    expect(fakeDb.batchCommitCount).toBe(1);
    expect(fakeDb.deletedIds.sort()).toEqual(["obj-1", "obj-2"]);
  });

  it("deletes objects in chunks larger than 400", async () => {
    const objectCount = 450;
    const objects = Array.from({ length: objectCount }, (_, index) =>
      createObject(`obj-${index}`, index),
    );
    const fakeDb = new FakeFirestore(objects);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.deleteObjects({
      objectIds: objects.map((entry) => entry.id),
    });

    expect(result.deletedCount).toBe(objectCount);
    expect(fakeDb.batchCommitCount).toBe(2);

    const state = await executor.getBoardState();
    expect(state).toHaveLength(0);
  });
});

describe("BoardToolExecutor arrangeObjectsInGrid", () => {
  it("arranges four objects into two columns", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-a", 1, { x: 300, y: 300, width: 100, height: 80 }),
      createObject("obj-b", 2, { x: 100, y: 100, width: 120, height: 90 }),
      createObject("obj-c", 3, { x: 220, y: 110, width: 80, height: 70 }),
      createObject("obj-d", 4, { x: 140, y: 260, width: 150, height: 110 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.arrangeObjectsInGrid({
      objectIds: ["obj-a", "obj-b", "obj-c", "obj-d"],
      columns: 2,
      gapX: 20,
      gapY: 10,
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(result.tool).toBe("arrangeObjectsInGrid");
    expect(byId.get("obj-b")?.x).toBe(100);
    expect(byId.get("obj-b")?.y).toBe(100);
    expect(byId.get("obj-c")?.x).toBe(270);
    expect(byId.get("obj-c")?.y).toBe(100);
    expect(byId.get("obj-d")?.x).toBe(100);
    expect(byId.get("obj-d")?.y).toBe(220);
    expect(byId.get("obj-a")?.x).toBe(270);
    expect(byId.get("obj-a")?.y).toBe(220);
  });

  it("uses default origin and default gaps when omitted", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 200, y: 300, width: 100, height: 60 }),
      createObject("obj-2", 2, { x: 450, y: 120, width: 140, height: 90 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    await executor.arrangeObjectsInGrid({
      objectIds: ["obj-1", "obj-2"],
      columns: 2,
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(byId.get("obj-2")?.x).toBe(200);
    expect(byId.get("obj-2")?.y).toBe(120);
    expect(byId.get("obj-1")?.x).toBe(372);
    expect(byId.get("obj-1")?.y).toBe(120);
  });

  it("ignores missing object ids", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 20, y: 20, width: 120, height: 90 }),
      createObject("obj-2", 2, { x: 260, y: 20, width: 120, height: 90 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.arrangeObjectsInGrid({
      objectIds: ["obj-2", "missing-id", "obj-1"],
      columns: 2,
      gapX: 10,
      gapY: 10,
      originX: 50,
      originY: 80,
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(result.tool).toBe("arrangeObjectsInGrid");
    expect(byId.get("obj-1")?.x).toBe(50);
    expect(byId.get("obj-1")?.y).toBe(80);
    expect(byId.get("obj-2")?.x).toBe(180);
    expect(byId.get("obj-2")?.y).toBe(80);
  });
});

describe("BoardToolExecutor alignObjects", () => {
  it("aligns selected objects to left edge", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 100, y: 120, width: 140, height: 90 }),
      createObject("obj-2", 2, { x: 300, y: 210, width: 90, height: 70 }),
      createObject("obj-3", 3, { x: 220, y: 320, width: 120, height: 60 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.alignObjects({
      objectIds: ["obj-1", "obj-2", "obj-3"],
      alignment: "left",
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(result.tool).toBe("alignObjects");
    expect(byId.get("obj-1")?.x).toBe(100);
    expect(byId.get("obj-2")?.x).toBe(100);
    expect(byId.get("obj-3")?.x).toBe(100);
  });
});

describe("BoardToolExecutor distributeObjects", () => {
  it("distributes selected objects horizontally by center points", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 100, y: 80, width: 100, height: 80 }),
      createObject("obj-2", 2, { x: 260, y: 80, width: 100, height: 80 }),
      createObject("obj-3", 3, { x: 500, y: 80, width: 100, height: 80 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.distributeObjects({
      objectIds: ["obj-1", "obj-2", "obj-3"],
      axis: "horizontal",
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(result.tool).toBe("distributeObjects");
    expect(byId.get("obj-1")?.x).toBe(100);
    expect(byId.get("obj-2")?.x).toBe(300);
    expect(byId.get("obj-3")?.x).toBe(500);
  });
});

describe("BoardToolExecutor createShape", () => {
  it("creates line shape with line-safe minimum size", async () => {
    const fakeDb = new FakeFirestore([]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.createShape({
      type: "line",
      x: 180,
      y: 220,
      width: 8,
      height: 1,
      color: "#94a3b8",
    });
    const state = await executor.getBoardState();

    expect(result.tool).toBe("createShape");
    expect(state).toHaveLength(1);
    expect(state[0]?.type).toBe("line");
    expect(state[0]?.width).toBe(24);
    expect(state[0]?.height).toBe(2);
  });
});
