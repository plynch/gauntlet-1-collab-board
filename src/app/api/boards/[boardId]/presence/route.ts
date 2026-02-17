import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import { canUserReadBoard, parseBoardDoc } from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardPresenceRouteContext = {
  params: Promise<{
    boardId: string;
  }>;
};

type PresencePatchPayload = {
  active: boolean;
  cursorX: number | null;
  cursorY: number | null;
};

function getDebugMessage(error: unknown): string | undefined {
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

function parsePresencePayload(input: unknown): PresencePatchPayload | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    active?: unknown;
    cursorX?: unknown;
    cursorY?: unknown;
  };

  if (typeof candidate.active !== "boolean") {
    return null;
  }

  const cursorX =
    typeof candidate.cursorX === "number" && Number.isFinite(candidate.cursorX)
      ? candidate.cursorX
      : null;
  const cursorY =
    typeof candidate.cursorY === "number" && Number.isFinite(candidate.cursorY)
      ? candidate.cursorY
      : null;

  return {
    active: candidate.active,
    cursorX,
    cursorY
  };
}

export async function PATCH(request: NextRequest, context: BoardPresenceRouteContext) {
  try {
    const user = await requireUser(request);
    const params = await context.params;
    const boardId = params.boardId?.trim();

    if (!boardId) {
      return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    }

    let payload: unknown = null;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsedPayload = parsePresencePayload(payload);
    if (!parsedPayload) {
      return NextResponse.json({ error: "Invalid presence payload." }, { status: 400 });
    }

    const db = getFirebaseAdminDb();
    const boardRef = db.collection("boards").doc(boardId);
    const boardSnapshot = await boardRef.get();

    if (!boardSnapshot.exists) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const board = parseBoardDoc(boardSnapshot.data());
    if (!board) {
      return NextResponse.json({ error: "Invalid board data." }, { status: 500 });
    }

    if (!canUserReadBoard(board, user.uid)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await db
      .collection("boards")
      .doc(boardId)
      .collection("presence")
      .doc(user.uid)
      .set(
        {
          uid: user.uid,
          displayName: user.name ?? null,
          email: user.email ?? null,
          active: parsedPayload.active,
          cursorX: parsedPayload.cursorX,
          cursorY: parsedPayload.cursorY,
          lastSeenAtMs: Date.now(),
          lastSeenAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to update board presence", error);
    return NextResponse.json(
      {
        error: "Failed to update board presence.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}
