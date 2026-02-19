/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const getFirebaseAdminDbMock = vi.fn();
const assertFirestoreWritesAllowedInDevMock = vi.fn();
const parseBoardDocMock = vi.fn();
const canUserReadBoardMock = vi.fn();

vi.mock("@/server/auth/require-user", () => {
  class AuthError extends Error {
    readonly status: number;

    /**
     * Initializes this class instance.
     */
    constructor(message: string, status = 401) {
      super(message);
      this.status = status;
    }
  }

  return {
    AuthError,
    requireUser: requireUserMock,
  };
});

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminDb: getFirebaseAdminDbMock,
  assertFirestoreWritesAllowedInDev: assertFirestoreWritesAllowedInDevMock,
}));

vi.mock("@/server/boards/board-access", () => ({
  canUserReadBoard: canUserReadBoardMock,
  parseBoardDoc: parseBoardDocMock,
}));

/**
 * Creates fake db.
 */
function createFakeDb(boardData: Record<string, unknown> | null) {
  const presenceWrites: Array<Record<string, unknown>> = [];

  const boardDocRef = {
    /**
     * Handles get.
     */
    async get() {
      return {
        exists: Boolean(boardData),
        data: () => boardData,
      };
    },
    /**
     * Handles collection.
     */
    collection(name: string) {
      if (name !== "presence") {
        throw new Error(`Unsupported subcollection: ${name}`);
      }

      return {
        /**
         * Handles doc.
         */
        doc(id: string) {
          void id;
          return {
            /**
             * Handles set.
             */
            async set(value: Record<string, unknown>) {
              presenceWrites.push(value);
            },
          };
        },
      };
    },
  };

  return {
    presenceWrites,
    /**
     * Handles collection.
     */
    collection(name: string) {
      if (name !== "boards") {
        throw new Error(`Unsupported collection: ${name}`);
      }

      return {
        /**
         * Handles doc.
         */
        doc(id: string) {
          void id;
          return boardDocRef;
        },
      };
    },
  };
}

/**
 * Creates request.
 */
function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/boards/board-1/presence", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const context = {
  params: Promise.resolve({ boardId: "board-1" }),
};

describe("/api/boards/[boardId]/presence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseBoardDocMock.mockImplementation((value: unknown) => value);
    canUserReadBoardMock.mockReturnValue(true);
  });

  it("returns 400 for invalid presence payload", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb({
        ownerId: "owner-1",
        title: "Board",
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        active: "yes",
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 when read access is denied", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    canUserReadBoardMock.mockReturnValue(false);
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb({
        ownerId: "owner-1",
        title: "Board",
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        active: true,
        cursorX: 10,
        cursorY: 20,
      }),
      context,
    );

    expect(response.status).toBe(403);
  });

  it("writes presence heartbeat for valid payload", async () => {
    requireUserMock.mockResolvedValue({
      uid: "user-1",
      name: "User One",
      email: "user@example.com",
    });
    const fakeDb = createFakeDb({
      ownerId: "owner-1",
      title: "Board",
    });
    getFirebaseAdminDbMock.mockReturnValue(fakeDb);

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        active: true,
        cursorX: 22,
        cursorY: 48,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(fakeDb.presenceWrites).toHaveLength(1);
    expect(assertFirestoreWritesAllowedInDevMock).toHaveBeenCalledTimes(1);
  });
});
