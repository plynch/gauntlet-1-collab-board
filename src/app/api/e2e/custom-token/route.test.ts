/**
 * @vitest-environment node
 */

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const getFirebaseAdminAuthMock = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  getFirebaseAdminAuth: getFirebaseAdminAuthMock,
}));

const originalNodeEnv = process.env.NODE_ENV;
const originalAuthEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;

afterEach(() => {
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }

  if (originalAuthEmulatorHost === undefined) {
    delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
  } else {
    process.env.FIREBASE_AUTH_EMULATOR_HOST = originalAuthEmulatorHost;
  }

  getFirebaseAdminAuthMock.mockReset();
});

describe("GET /api/e2e/custom-token", () => {
  it("returns token in non-production emulator mode", async () => {
    process.env.NODE_ENV = "test";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    getFirebaseAdminAuthMock.mockReturnValue({
      getUser: vi.fn().mockResolvedValue({ uid: "e2e-user", email: "e2e-user@e2e.local" }),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      createCustomToken: vi.fn().mockResolvedValue("token-123"),
    });

    const { GET } = await import("./route");
    const request = new NextRequest(
      "http://localhost:3000/api/e2e/custom-token?uid=e2e-user",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      token?: unknown;
      uid?: unknown;
    };
    expect(payload.token).toBe("token-123");
    expect(payload.uid).toBe("e2e-user");
  });

  it("returns 404 in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
    getFirebaseAdminAuthMock.mockReturnValue({
      getUser: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      createCustomToken: vi.fn(),
    });

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/api/e2e/custom-token");
    const response = await GET(request);

    expect(response.status).toBe(404);
  });
});
