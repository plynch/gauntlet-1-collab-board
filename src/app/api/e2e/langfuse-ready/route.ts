import { NextResponse } from "next/server";

import { getLangfuseClient } from "@/features/ai/observability/langfuse-client";

/**
 * Returns whether e2e route enabled is true.
 */
function isE2eRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.ENABLE_E2E_LAB === "1"
  );
}

/**
 * Handles get.
 */
export async function GET() {
  if (!isE2eRouteEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const client = getLangfuseClient();
  const baseUrl = process.env.LANGFUSE_BASE_URL?.trim() || null;

  return NextResponse.json({
    ready: Boolean(client),
    baseUrl,
  });
}
