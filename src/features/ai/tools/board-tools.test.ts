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

    constructor(initialObjects: Array<{ id: string; data: ObjectDoc }>) {
    initialObjects.forEach((entry) => {
      this.objects.set(entry.id, { ...entry.data });
    });
  }

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
              doc: (id?: string) => {
                const resolvedId = id && id.length > 0 ? id : (() => {
                  this.createdIdCounter += 1;
                  return `created-${this.createdIdCounter}`;
                })();

                return {
                  id: resolvedId,
                  update: async (payload: UpdatePayload) => {
                    const existing = this.objects.get(resolvedId);
                    if (!existing) {
                      throw new Error(`Object not found: ${resolvedId}`);
                    }

                    const { updatedAt, ...rest } = payload;
                    void updatedAt;
                    this.objects.set(resolvedId, {
                      ...existing,
                      ...rest,
                    });
                  },
                };
              },
            };
          },
        };
      },
    };
  }

    batch() {
    const pending: string[] = [];
    const pendingUpdates: Array<{ id: string; payload: UpdatePayload }> = [];
    const pendingCreates: Array<{ id: string; payload: Record<string, unknown> }> =
      [];

    return {
      delete: (docRef: { id: string }) => {
        pending.push(docRef.id);
      },
      update: (docRef: { id: string }, payload: UpdatePayload) => {
        pendingUpdates.push({ id: docRef.id, payload });
      },
      set: (docRef: { id: string }, payload: Record<string, unknown>) => {
        pendingCreates.push({ id: docRef.id, payload });
      },
      commit: async () => {
        this.batchCommitCount += 1;
        pending.forEach((id) => {
          if (this.objects.delete(id)) {
            this.deletedIds.push(id);
          }
        });
        pendingUpdates.forEach((entry) => {
          const existing = this.objects.get(entry.id);
          if (!existing) {
            throw new Error(`Object not found: ${entry.id}`);
          }
          const { updatedAt, ...rest } = entry.payload;
          void updatedAt;
          this.objects.set(entry.id, {
            ...existing,
            ...rest,
          });
        });
        pendingCreates.forEach((entry) => {
          this.objects.set(entry.id, {
            type:
              typeof entry.payload.type === "string" ? entry.payload.type : "sticky",
            zIndex:
              typeof entry.payload.zIndex === "number"
                ? entry.payload.zIndex
                : 0,
            x: typeof entry.payload.x === "number" ? entry.payload.x : 0,
            y: typeof entry.payload.y === "number" ? entry.payload.y : 0,
            width:
              typeof entry.payload.width === "number"
                ? entry.payload.width
                : 120,
            height:
              typeof entry.payload.height === "number"
                ? entry.payload.height
                : 120,
            rotationDeg:
              typeof entry.payload.rotationDeg === "number"
                ? entry.payload.rotationDeg
                : 0,
            color:
              typeof entry.payload.color === "string"
                ? entry.payload.color
                : "#93c5fd",
            text:
              typeof entry.payload.text === "string" ? entry.payload.text : "",
          });
        });
      },
    };
  }
}

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

  it("distributes selected objects across viewport bounds when provided", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 100, y: 80, width: 100, height: 80 }),
      createObject("obj-2", 2, { x: 220, y: 140, width: 100, height: 80 }),
      createObject("obj-3", 3, { x: 360, y: 200, width: 100, height: 80 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    await executor.distributeObjects({
      objectIds: ["obj-1", "obj-2", "obj-3"],
      axis: "horizontal",
      viewportBounds: {
        left: 0,
        top: 0,
        width: 1_000,
        height: 700,
      },
    });

    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(byId.get("obj-1")?.x).toBe(0);
    expect(byId.get("obj-2")?.x).toBe(450);
    expect(byId.get("obj-3")?.x).toBe(900);
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

describe("BoardToolExecutor createStickyNote", () => {
  it("snaps non-palette sticky colors to nearest palette swatch", async () => {
    const fakeDb = new FakeFirestore([]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    await executor.createStickyNote({
      text: "Research",
      x: 140,
      y: 180,
      color: "#ffff00",
    });
    const state = await executor.getBoardState();

    expect(state).toHaveLength(1);
    expect(state[0]?.color).toBe("#fde68a");
    expect(state[0]?.text).toBe("Research");
  });
});

describe("BoardToolExecutor createStickyBatch", () => {
  it("creates 10 stickies in two rows with defaults", async () => {
    const fakeDb = new FakeFirestore([]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.createStickyBatch({
      count: 10,
      color: "#fca5a5",
      originX: 100,
      originY: 120,
      textPrefix: "Idea",
    });
    const state = await executor.getBoardState();

    expect(result.tool).toBe("createStickyBatch");
    expect(result.createdObjectIds).toHaveLength(10);
    expect(state).toHaveLength(10);
    expect(state[0]?.x).toBe(100);
    expect(state[0]?.y).toBe(120);
    expect(state[5]?.x).toBe(100);
    expect(state[5]?.y).toBe(310);
    expect(state[9]?.text).toBe("Idea 10");
    expect(fakeDb.batchCommitCount).toBe(1);
  });

  it("keeps single sticky batch text unsuffixed", async () => {
    const fakeDb = new FakeFirestore([]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.createStickyBatch({
      count: 1,
      color: "yellow",
      originX: 300,
      originY: 220,
      textPrefix: "user research",
    });
    const state = await executor.getBoardState();

    expect(result.tool).toBe("createStickyBatch");
    expect(result.createdObjectIds).toHaveLength(1);
    expect(state).toHaveLength(1);
    expect(state[0]?.text).toBe("user research");
    expect(state[0]?.color).toBe("#fde68a");
  });
});

describe("BoardToolExecutor background container z-order", () => {
  it("creates grid containers behind existing objects", async () => {
    const fakeDb = new FakeFirestore([
      createObject("sticky-1", 10, { type: "sticky", x: 120, y: 140 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.createGridContainer({
      x: 80,
      y: 90,
      width: 800,
      height: 500,
      rows: 2,
      cols: 2,
      gap: 2,
    });
    const state = await executor.getBoardState();
    const createdContainer = state.find(
      (objectItem) => objectItem.id === result.objectId,
    );
    const sticky = state.find((objectItem) => objectItem.id === "sticky-1");

    expect(result.tool).toBe("createGridContainer");
    expect(createdContainer).toBeDefined();
    expect(sticky).toBeDefined();
    expect(createdContainer?.zIndex).toBeLessThan(sticky?.zIndex ?? 0);
    expect(state[0]?.id).toBe(result.objectId);
  });
});

describe("BoardToolExecutor moveObjects", () => {
  it("moves a group by delta in one batch", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 100, y: 120 }),
      createObject("obj-2", 2, { x: 260, y: 120 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.moveObjects({
      objectIds: ["obj-1", "obj-2"],
      delta: {
        dx: 200,
        dy: 40,
      },
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(result.tool).toBe("moveObjects");
    expect(byId.get("obj-1")?.x).toBe(300);
    expect(byId.get("obj-1")?.y).toBe(160);
    expect(byId.get("obj-2")?.x).toBe(460);
    expect(byId.get("obj-2")?.y).toBe(160);
  });

  it("moves a group to viewport right side", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 120, y: 140, width: 120, height: 100 }),
      createObject("obj-2", 2, { x: 280, y: 140, width: 120, height: 100 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    await executor.moveObjects({
      objectIds: ["obj-1", "obj-2"],
      toViewportSide: {
        side: "right",
        viewportBounds: {
          left: 0,
          top: 0,
          width: 1000,
          height: 600,
        },
        padding: 40,
      },
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(byId.get("obj-1")?.x).toBe(760);
    expect(byId.get("obj-2")?.x).toBe(760);
    expect(byId.get("obj-1")?.y).toBe(140);
    expect(byId.get("obj-2")?.y).toBe(272);
  });

  it("moves a group to viewport top side in a row", async () => {
    const fakeDb = new FakeFirestore([
      createObject("obj-1", 1, { x: 120, y: 140, width: 120, height: 100 }),
      createObject("obj-2", 2, { x: 280, y: 140, width: 120, height: 100 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    await executor.moveObjects({
      objectIds: ["obj-1", "obj-2"],
      toViewportSide: {
        side: "top",
        viewportBounds: {
          left: 0,
          top: 0,
          width: 1000,
          height: 600,
        },
        padding: 40,
      },
    });
    const state = await executor.getBoardState();
    const byId = new Map(state.map((objectItem) => [objectItem.id, objectItem]));

    expect(byId.get("obj-1")?.x).toBe(120);
    expect(byId.get("obj-2")?.x).toBe(272);
    expect(byId.get("obj-1")?.y).toBe(40);
    expect(byId.get("obj-2")?.y).toBe(40);
  });
});

describe("BoardToolExecutor fitFrameToContents", () => {
  it("resizes frame to fit overlapping contents", async () => {
    const fakeDb = new FakeFirestore([
      createObject("frame-1", 1, {
        x: 100,
        y: 100,
        width: 600,
        height: 420,
        text: "Sprint frame",
      }),
      createObject("obj-1", 2, { x: 180, y: 180, width: 120, height: 80 }),
      createObject("obj-2", 3, { x: 520, y: 360, width: 140, height: 90 }),
      createObject("obj-3", 4, { x: 900, y: 700, width: 120, height: 90 }),
    ]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore,
    });

    const result = await executor.fitFrameToContents({
      frameId: "frame-1",
      padding: 20,
    });
    const state = await executor.getBoardState();
    const frame = state.find((objectItem) => objectItem.id === "frame-1");

    expect(result.tool).toBe("fitFrameToContents");
    expect(frame?.x).toBe(160);
    expect(frame?.y).toBe(160);
    expect(frame?.width).toBe(520);
    expect(frame?.height).toBe(310);
  });
});
