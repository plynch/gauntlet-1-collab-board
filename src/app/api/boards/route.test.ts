/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUserMock = vi.fn();
const getFirebaseAdminDbMock = vi.fn();
const assertFirestoreWritesAllowedInDevMock = vi.fn();

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

type BoardDocData = Record<string, unknown>;

/**
 * Creates fake boards db.
 */
function createFakeBoardsDb(
  initialBoards: Array<{ id: string; data: BoardDocData }>,
) {
  const boards = new Map<string, BoardDocData>(
    initialBoards.map((entry) => [entry.id, { ...entry.data }]),
  );
  let nextId = 1;

  /**
   * Creates query.
   */
  const createQuery = (ownerId: string, max = Number.POSITIVE_INFINITY) => ({
    /**
     * Handles limit.
     */
    limit(limitCount: number) {
      return createQuery(ownerId, limitCount);
    },
    /**
     * Handles get.
     */
    async get() {
      const docs = Array.from(boards.entries())
        .filter(([, value]) => value.ownerId === ownerId)
        .slice(0, max)
        .map(([id, value]) => ({
          id,
          data: () => value,
        }));

      return {
        docs,
        size: docs.length,
      };
    },
  });

  const collectionApi = {
    /**
     * Handles where.
     */
    where(field: string, _op: string, value: string) {
      if (field !== "ownerId") {
        throw new Error(`Unsupported where field: ${field}`);
      }
      return createQuery(value);
    },
    /**
     * Handles doc.
     */
    doc(id?: string) {
      const resolvedId = id ?? `generated-${nextId++}`;
      return {
        id: resolvedId,
        /**
         * Handles set.
         */
        async set(value: BoardDocData) {
          boards.set(resolvedId, { ...value });
        },
        /**
         * Handles update.
         */
        async update(value: BoardDocData) {
          const existing = boards.get(resolvedId);
          if (!existing) {
            throw new Error("Missing board");
          }

          boards.set(resolvedId, {
            ...existing,
            ...value,
          });
        },
        /**
         * Handles get.
         */
        async get() {
          const value = boards.get(resolvedId);
          return {
            id: resolvedId,
            exists: Boolean(value),
            data: () => value,
          };
        },
        /**
         * Handles delete.
         */
        async delete() {
          boards.delete(resolvedId);
        },
      };
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
      return collectionApi;
    },
  };
}

/**
 * Creates json request.
 */
function createJsonRequest(
  method: "GET" | "POST",
  body?: unknown,
): NextRequest {
  return new NextRequest("http://localhost:3000/api/boards", {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
}

/**
 * Creates raw request.
 */
function createRawRequest(method: "POST", rawBody: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/boards", {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: rawBody,
  });
}

describe("/api/boards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when auth fails", async () => {
    const authModule = await import("@/server/auth/require-user");
    requireUserMock.mockRejectedValue(
      new authModule.AuthError("Missing Authorization header.", 401),
    );
    getFirebaseAdminDbMock.mockReturnValue(createFakeBoardsDb([]));

    const { GET } = await import("./route");
    const response = await GET(createJsonRequest("GET"));

    expect(response.status).toBe(401);
  });

  it("returns 400 for malformed JSON on create", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getFirebaseAdminDbMock.mockReturnValue(createFakeBoardsDb([]));

    const { POST } = await import("./route");
    const response = await POST(createRawRequest("POST", "{"));
    const payload = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid JSON body.");
  });

  it("returns 409 when owner has reached board limit", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeBoardsDb(
        Array.from({ length: 5 }, (_, index) => ({
          id: `board-${index + 1}`,
          data: {
            ownerId: "user-1",
            title: `Board ${index + 1}`,
            openEdit: true,
            openRead: true,
          },
        })),
      ),
    );

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest("POST", {
        title: "New board",
      }),
    );

    expect(response.status).toBe(409);
  });

  it("creates a board when payload is valid", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getFirebaseAdminDbMock.mockReturnValue(createFakeBoardsDb([]));

    const { POST } = await import("./route");
    const response = await POST(
      createJsonRequest("POST", {
        title: "  Reliability board  ",
      }),
    );
    const payload = (await response.json()) as {
      board?: {
        id: string;
        title: string;
      };
    };

    expect(response.status).toBe(201);
    expect(payload.board?.title).toBe("Reliability board");
    expect(assertFirestoreWritesAllowedInDevMock).toHaveBeenCalledTimes(1);
  });

  it("lists owner boards", async () => {
    requireUserMock.mockResolvedValue({ uid: "user-1" });
    getFirebaseAdminDbMock.mockReturnValue(
      createFakeBoardsDb([
        {
          id: "board-a",
          data: {
            ownerId: "user-1",
            title: "A",
            openEdit: true,
            openRead: true,
          },
        },
        {
          id: "board-b",
          data: {
            ownerId: "user-1",
            title: "B",
            openEdit: true,
            openRead: true,
          },
        },
      ]),
    );

    const { GET } = await import("./route");
    const response = await GET(createJsonRequest("GET"));
    const payload = (await response.json()) as {
      boards: Array<{ id: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.boards).toHaveLength(2);
  });
});
