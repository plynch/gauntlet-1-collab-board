import { NextRequest, NextResponse } from "next/server";

import { AuthError } from "@/server/auth/require-user";

/**
 * Gets debug message.
 */
export function getDebugMessage(error: unknown): string | undefined {
  if (process.env.NODE_ENV === "production") {
    return undefined;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return undefined;
}

/**
 * Handles trim param.
 */
export function trimParam(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Handles read json body.
 */
export async function readJsonBody(
  request: NextRequest,
): Promise<
  { ok: true; value: unknown } | { ok: false; response: NextResponse }
> {
  try {
    return {
      ok: true,
      value: await request.json(),
    };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON body." },
        { status: 400 },
      ),
    };
  }
}

/**
 * Handles handle route error.
 */
export function handleRouteError(
  error: unknown,
  message: string,
): NextResponse {
  if (error instanceof AuthError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: message,
      debug: getDebugMessage(error),
    },
    { status: 500 },
  );
}
