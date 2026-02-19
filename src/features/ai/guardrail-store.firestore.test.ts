import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it } from "vitest";

import { createFirestoreGuardrailStore } from "@/features/ai/guardrail-store.firestore";

type Snapshot = {
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
};

class FakeDocRef {
  constructor(
    private readonly namespace: string,
    private readonly id: string,
    private readonly store: Map<string, Record<string, unknown>>
  ) {}

  private get key(): string {
    return `${this.namespace}/${this.id}`;
  }

  getSnapshot(): Snapshot {
    const value = this.store.get(this.key);
    return {
      exists: Boolean(value),
      data: () => value
    };
  }

  setData(value: Record<string, unknown>, options?: { merge?: boolean }): void {
    if (options?.merge) {
      const current = this.store.get(this.key) ?? {};
      this.store.set(this.key, {
        ...current,
        ...value
      });
      return;
    }

    this.store.set(this.key, { ...value });
  }

  deleteData(): void {
    this.store.delete(this.key);
  }

  async delete(): Promise<void> {
    this.deleteData();
  }
}

class FakeCollectionRef {
  constructor(
    private readonly namespace: string,
    private readonly store: Map<string, Record<string, unknown>>
  ) {}

  doc(id: string): FakeDocRef {
    return new FakeDocRef(this.namespace, id, this.store);
  }
}

class FakeTransaction {
  async get(docRef: FakeDocRef): Promise<Snapshot> {
    return docRef.getSnapshot();
  }

  set(docRef: FakeDocRef, value: Record<string, unknown>, options?: { merge?: boolean }): void {
    docRef.setData(value, options);
  }

  delete(docRef: FakeDocRef): void {
    docRef.deleteData();
  }
}

class FakeFirestore {
  private readonly data = new Map<string, Record<string, unknown>>();

  collection(namespace: string): FakeCollectionRef {
    return new FakeCollectionRef(namespace, this.data);
  }

  async runTransaction<T>(callback: (transaction: FakeTransaction) => Promise<T>): Promise<T> {
    const transaction = new FakeTransaction();
    return callback(transaction);
  }
}

describe("createFirestoreGuardrailStore", () => {
  it("coordinates locks across store instances sharing the same db", async () => {
    const fakeDb = new FakeFirestore();
    const firstStore = createFirestoreGuardrailStore({
      db: fakeDb as unknown as Firestore
    });
    const secondStore = createFirestoreGuardrailStore({
      db: fakeDb as unknown as Firestore
    });

    const first = await firstStore.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs: 1_000,
      ttlMs: 300
    });
    const second = await secondStore.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs: 1_050,
      ttlMs: 300
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);

    await firstStore.releaseBoardCommandLock("board-1");

    const third = await secondStore.acquireBoardCommandLock({
      boardId: "board-1",
      nowMs: 1_100,
      ttlMs: 300
    });
    expect(third.ok).toBe(true);
  });

  it("shares user rate limiting across store instances", async () => {
    const fakeDb = new FakeFirestore();
    const firstStore = createFirestoreGuardrailStore({
      db: fakeDb as unknown as Firestore
    });
    const secondStore = createFirestoreGuardrailStore({
      db: fakeDb as unknown as Firestore
    });

    const first = await firstStore.checkUserRateLimit({
      userId: "user-1",
      nowMs: 2_000,
      windowMs: 500,
      maxCommandsPerWindow: 1
    });
    const second = await secondStore.checkUserRateLimit({
      userId: "user-1",
      nowMs: 2_100,
      windowMs: 500,
      maxCommandsPerWindow: 1
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(false);
  });
});
