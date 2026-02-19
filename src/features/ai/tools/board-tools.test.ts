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

class FakeFirestore {
  readonly objects = new Map<string, ObjectDoc>();
  readonly deletedIds: string[] = [];
  batchCommitCount = 0;

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
              throw new Error(`Unsupported subcollection: ${subcollectionName}`);
            }

            return {
              get: async () => ({
                docs: Array.from(this.objects.entries()).map(([id, data]) => ({
                  id,
                  data: () => ({ ...data })
                }))
              }),
              doc: (id: string) => ({ id })
            };
          }
        };
      }
    };
  }

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
      }
    };
  }
}

function createObject(id: string, zIndex: number): { id: string; data: ObjectDoc } {
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
      text: ""
    }
  };
}

describe("BoardToolExecutor deleteObjects", () => {
  it("returns zero deleted count when ids are missing", async () => {
    const fakeDb = new FakeFirestore([createObject("obj-1", 1)]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore
    });

    const result = await executor.deleteObjects({
      objectIds: ["missing-1", "missing-2"]
    });

    expect(result.tool).toBe("deleteObjects");
    expect(result.deletedCount).toBe(0);
    expect(fakeDb.batchCommitCount).toBe(0);
  });

  it("deduplicates object ids before deletion", async () => {
    const fakeDb = new FakeFirestore([createObject("obj-1", 1), createObject("obj-2", 2)]);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore
    });

    const result = await executor.deleteObjects({
      objectIds: ["obj-1", "obj-1", "obj-2", "", "missing"]
    });

    expect(result.deletedCount).toBe(2);
    expect(fakeDb.batchCommitCount).toBe(1);
    expect(fakeDb.deletedIds.sort()).toEqual(["obj-1", "obj-2"]);
  });

  it("deletes objects in chunks larger than 400", async () => {
    const objectCount = 450;
    const objects = Array.from({ length: objectCount }, (_, index) =>
      createObject(`obj-${index}`, index)
    );
    const fakeDb = new FakeFirestore(objects);
    const executor = new BoardToolExecutor({
      boardId: "board-1",
      userId: "user-1",
      db: fakeDb as unknown as Firestore
    });

    const result = await executor.deleteObjects({
      objectIds: objects.map((entry) => entry.id)
    });

    expect(result.deletedCount).toBe(objectCount);
    expect(fakeDb.batchCommitCount).toBe(2);

    const state = await executor.getBoardState();
    expect(state).toHaveLength(0);
  });
});
