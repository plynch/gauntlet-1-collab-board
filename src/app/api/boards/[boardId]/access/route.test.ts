/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const getFirebaseAdminDbMock = vi.fn();
const getFirebaseAdminAuthMock = vi.fn();
const assertFirestoreWritesAllowedInDevMock = vi.fn();
const parseBoardDocMock = vi.fn();
const resolveUserProfilesMock = vi.fn();

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
  getFirebaseAdminAuth: getFirebaseAdminAuthMock,
  assertFirestoreWritesAllowedInDev: assertFirestoreWritesAllowedInDevMock,
}));

vi.mock("@/server/boards/board-access", () => ({
  parseBoardDoc: parseBoardDocMock,
  resolveUserProfiles: resolveUserProfilesMock,
  toIsoDate: () => null,
}));

type BoardDoc = Record<string, unknown>;

/**
 * Creates fake db.
 */
function createFakeDb(initialBoard?: BoardDoc) {
  const board = initialBoard ? { ...initialBoard } : null;

  const boardRef = {
    /**
     * Handles get.
     */
    async get() {
      return {
        exists: Boolean(board),
        data: () => board,
      };
    },
    /**
     * Handles update.
     */
    async update(value: Record<string, unknown>) {
      void value;
      // no-op in test double
    },
  };

  return {
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
          return boardRef;
        },
      };
    },
  };
}

/**
 * Creates request.
 */
function createRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/boards/board-1/access", {
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

describe("/api/boards/[boardId]/access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseBoardDocMock.mockImplementation((value: unknown) => value);
    resolveUserProfilesMock.mockResolvedValue([]);
    getFirebaseAdminAuthMock.mockReturnValue({
      getUserByEmail: vi.fn().mockResolvedValue(null),
    });
  });

  it("returns 400 for invalid access action", async () => {
    requireUserMock.mockResolvedValue({ uid: "owner-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb({
        ownerId: "owner-1",
        title: "Board",
        editorIds: [],
        readerIds: [],
        openEdit: true,
        openRead: true,
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        action: "unknown",
      }),
      context,
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 when non-owner tries to update access", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-2" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb({
        ownerId: "owner-1",
        title: "Board",
        editorIds: [],
        readerIds: [],
        openEdit: true,
        openRead: true,
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        action: "set-open-read",
        openRead: true,
      }),
      context,
    );

    expect(response.status).toBe(403);
  });

  it("updates access flags for owner", async () => {
    requireUserMock.mockResolvedValue({ uid: "owner-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb({
        ownerId: "owner-1",
        title: "Board",
        editorIds: [],
        readerIds: [],
        openEdit: true,
        openRead: true,
      }),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest({
        action: "set-open-read",
        openRead: false,
      }),
      context,
    );

    expect(response.status).toBe(200);
    expect(assertFirestoreWritesAllowedInDevMock).toHaveBeenCalledTimes(1);
  });
});
