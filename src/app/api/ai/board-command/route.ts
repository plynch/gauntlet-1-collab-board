import { NextRequest, NextResponse } from "next/server";

import {
  buildStubBoardCommandResponse,
  parseBoardCommandRequest
} from "@/features/ai/board-command";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

export async function POST(request: NextRequest) {
  try {
    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const parsedPayload = parseBoardCommandRequest(payload);
    if (!parsedPayload) {
      return NextResponse.json(
        { error: "Invalid board command payload." },
        { status: 400 }
      );
    }

    const user = await requireUser(request);
    const boardSnapshot = await getFirebaseAdminDb()
      .collection("boards")
      .doc(parsedPayload.boardId)
      .get();

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

    const response = buildStubBoardCommandResponse({
      message: parsedPayload.message,
      canEdit: canUserEditBoard(board, user.uid)
    });

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to handle board AI command", error);
    return NextResponse.json(
      {
        error: "Failed to handle board AI command.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}

