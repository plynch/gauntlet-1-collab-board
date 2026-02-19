/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("next security headers", () => {
  it("includes baseline security headers", async () => {
    const headerConfig = await nextConfig.headers?.();
    expect(headerConfig).toBeDefined();

    const headers = headerConfig?.[0]?.headers ?? [];
    const headerKeys = new Set(headers.map((entry) => entry.key));

    expect(headerKeys.has("X-Content-Type-Options")).toBe(true);
    expect(headerKeys.has("X-Frame-Options")).toBe(true);
    expect(headerKeys.has("Referrer-Policy")).toBe(true);
    expect(headerKeys.has("Permissions-Policy")).toBe(true);
  });

  it("only includes HSTS in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    const mutableEnv = process.env as Record<string, string | undefined>;

    try {
      mutableEnv.NODE_ENV = "development";
      const devHeaders = (await nextConfig.headers?.())?.[0]?.headers ?? [];
      expect(devHeaders.some((entry) => entry.key === "Strict-Transport-Security")).toBe(false);

      mutableEnv.NODE_ENV = "production";
      const prodHeaders = (await nextConfig.headers?.())?.[0]?.headers ?? [];
      expect(prodHeaders.some((entry) => entry.key === "Strict-Transport-Security")).toBe(true);
    } finally {
      mutableEnv.NODE_ENV = originalEnv;
    }
  });
});
