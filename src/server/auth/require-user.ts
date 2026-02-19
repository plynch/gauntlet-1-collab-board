import type { DecodedIdToken } from "firebase-admin/auth";
import type { NextRequest } from "next/server";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export class AuthError extends Error {
  readonly status: number;

  /**
   * Initializes this class instance.
   */
  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

/**
 * Gets bearer token.
 */
function getBearerToken(request: NextRequest): string {
  const headerValue = request.headers.get("authorization");

  if (!headerValue) {
    throw new AuthError("Missing Authorization header.");
  }

  if (!headerValue.startsWith("Bearer ")) {
    throw new AuthError("Authorization header must be a Bearer token.");
  }

  const token = headerValue.slice("Bearer ".length).trim();

  if (!token) {
    throw new AuthError("Bearer token is empty.");
  }

  return token;
}

/**
 * Handles require user.
 */
export async function requireUser(
  request: NextRequest,
): Promise<DecodedIdToken> {
  const idToken = getBearerToken(request);

  try {
    return await getFirebaseAdminAuth().verifyIdToken(idToken);
  } catch {
    throw new AuthError("Invalid or expired auth token.");
  }
}
