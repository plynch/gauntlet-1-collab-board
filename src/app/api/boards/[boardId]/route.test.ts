/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const getFirebaseAdminDbMock = vi.fn();
const assertFirestoreWritesAllowedInDevMock = vi.fn();
const canUserReadBoardMock = vi.fn();
const canUserEditBoardMock = vi.fn();
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
  assertFirestoreWritesAllowedInDev: assertFirestoreWritesAllowedInDevMock,
}));

vi.mock("@/server/boards/board-access", () => ({
  canUserReadBoard: canUserReadBoardMock,
  canUserEditBoard: canUserEditBoardMock,
  parseBoardDoc: parseBoardDocMock,
  resolveUserProfiles: resolveUserProfilesMock,
  toIsoDate: () => null,
}));

type BoardDoc = Record<string, unknown>;

/**
 * Creates fake db.
 */
function createFakeDb(initialBoards: Array<{ id: string; data: BoardDoc }>) {
  const boards = new Map(
    initialBoards.map((entry) => [entry.id, { ...entry.data }]),
  );

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
          return {
            /**
             * Handles get.
             */
            async get() {
              const board = boards.get(id);
              return {
                id,
                exists: Boolean(board),
                data: () => board,
              };
            },
            /**
             * Handles update.
             */
            async update(value: Record<string, unknown>) {
              const board = boards.get(id);
              if (!board) {
                throw new Error("Board not found");
              }

              boards.set(id, {
                ...board,
                ...value,
              });
            },
            /**
             * Handles delete.
             */
            async delete() {
              boards.delete(id);
            },
          };
        },
      };
    },
  };
}

/**
 * Creates request.
 */
function createRequest(method: "GET" | "PATCH" | "DELETE", body?: unknown) {
  return new NextRequest("http://localhost:3000/api/boards/board-1", {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

const context = {
  params: Promise.resolve({ boardId: "board-1" }),
};

describe("/api/boards/[boardId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    parseBoardDocMock.mockImplementation((value: unknown) => value);
    canUserReadBoardMock.mockReturnValue(true);
    canUserEditBoardMock.mockReturnValue(true);
    resolveUserProfilesMock.mockResolvedValue([]);
  });

  it("returns 401 when auth fails", async () => {
    const authModule = await import("@/server/auth/require-user");
    requireUserMock.mockRejectedValue(
      new authModule.AuthError("Missing Authorization header.", 401),
    );
    getFirebaseAdminDbMock.mockReturnValue(createFakeDb([]));

    const { GET } = await import("./route");
    const response = await GET(createRequest("GET"), context);

    expect(response.status).toBe(401);
  });

  it("returns 403 when read access is forbidden", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-2" });
    canUserReadBoardMock.mockReturnValue(false);
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb([
        {
          id: "board-1",
          data: {
            ownerId: "owner-1",
            title: "Board",
            editorIds: [],
            readerIds: [],
            openEdit: false,
            openRead: false,
          },
        },
      ]),
    );

    const { GET } = await import("./route");
    const response = await GET(createRequest("GET"), context);

    expect(response.status).toBe(403);
  });

  it("returns 400 when patch payload title is invalid", async () => {
    requireUserMock.mockResolvedValue({ uid: "owner-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb([
        {
          id: "board-1",
          data: {
            ownerId: "owner-1",
            title: "Board",
            editorIds: [],
            readerIds: [],
            openEdit: true,
            openRead: true,
          },
        },
      ]),
    );

    const { PATCH } = await import("./route");
    const response = await PATCH(
      createRequest("PATCH", {
        title: "  ",
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect(assertFirestoreWritesAllowedInDevMock).toHaveBeenCalledTimes(1);
  });

  it("deletes board for owner", async () => {
    requireUserMock.mockResolvedValue({ uid: "owner-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeDb([
        {
          id: "board-1",
          data: {
            ownerId: "owner-1",
            title: "Board",
            editorIds: [],
            readerIds: [],
            openEdit: true,
            openRead: true,
          },
        },
      ]),
    );

    const { DELETE } = await import("./route");
    const response = await DELETE(createRequest("DELETE"), context);
    const payload = (await response.json()) as { ok?: boolean };

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
  });
});
