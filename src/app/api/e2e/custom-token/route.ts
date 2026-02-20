import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

import { NextRequest, NextResponse } from "next/server";

/**
 * Returns whether e2e route enabled is true.
 */
function isE2eRouteEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" || process.env.ENABLE_E2E_LAB === "1"
  );
}

/**
 * Handles sanitize uid.
 */
function sanitizeUid(value: string | null): string {
  const fallback = "e2e-user";
  if (!value) {
    return fallback;
  }

  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  return sanitized.length > 0 ? sanitized : fallback;
}

/**
 * Handles to email.
 */
function toEmail(uid: string, rawEmail: string | null): string {
  if (!rawEmail) {
    return `${uid}@e2e.local`;
  }

  const normalized = rawEmail.trim().toLowerCase();
  if (normalized.length === 0 || !normalized.includes("@")) {
    return `${uid}@e2e.local`;
  }

  return normalized;
}

/**
 * Handles get.
 */
export async function GET(request: NextRequest) {
  if (!isE2eRouteEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return NextResponse.json(
      { error: "E2E custom token route requires FIREBASE_AUTH_EMULATOR_HOST." },
      { status: 403 },
    );
  }

  const uid = sanitizeUid(request.nextUrl.searchParams.get("uid"));
  const email = toEmail(uid, request.nextUrl.searchParams.get("email"));

  try {
    const token = await getFirebaseAdminAuth().createCustomToken(uid);
    return NextResponse.json({ token, uid, email });
  } catch (error) {
    console.error("Failed to mint e2e custom token", error);
    return NextResponse.json(
      { error: "Failed to mint e2e custom token." },
      { status: 500 },
    );
  }
}
