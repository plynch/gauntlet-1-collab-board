import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { assertFirestoreWritesAllowedInDev, getFirebaseAdminDb } from "@/lib/firebase/admin";
import {
  boardPresenceBodySchema,
  type BoardPresenceBody
} from "@/server/api/board-route-schemas";
import {
  handleRouteError,
  readJsonBody,
  trimParam
} from "@/server/api/route-helpers";
import { requireUser } from "@/server/auth/require-user";
import { canUserReadBoard, parseBoardDoc } from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardPresenceRouteContext = {
  params: Promise<{
    boardId: string;
  }>;
};

export async function PATCH(request: NextRequest, context: BoardPresenceRouteContext) {
  try {
    assertFirestoreWritesAllowedInDev();

    const user = await requireUser(request);
    const params = await context.params;
    const boardId = trimParam(params.boardId);

    if (!boardId) {
      return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    }

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const parsedPayload = boardPresenceBodySchema.safeParse(bodyResult.value);
    if (!parsedPayload.success) {
      return NextResponse.json({ error: "Invalid presence payload." }, { status: 400 });
    }
    const payload: BoardPresenceBody = parsedPayload.data;

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
          active: payload.active,
          cursorX: payload.cursorX,
          cursorY: payload.cursorY,
          lastSeenAtMs: Date.now(),
          lastSeenAt: FieldValue.serverTimestamp()
        },
        { merge: true }
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to update board presence", error);
    return handleRouteError(error, "Failed to update board presence.");
  }
}
