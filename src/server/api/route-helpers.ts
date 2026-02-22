import { NextRequest, NextResponse } from "next/server";

import { AuthError } from "@/server/auth/require-user";

const DOC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

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

export function trimParam(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function isValidDocId(value: string): boolean {
  return DOC_ID_PATTERN.test(value);
}

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
