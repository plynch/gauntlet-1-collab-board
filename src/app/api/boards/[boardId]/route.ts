import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import type { BoardDetail, BoardPermissions } from "@/features/boards/types";
import { assertFirestoreWritesAllowedInDev, getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc,
  resolveUserProfiles,
  toIsoDate,
  type BoardDoc
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardRouteContext = {
  params: Promise<{
    boardId: string;
  }>;
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

function parseBoardTitle(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, 80);
}

function toBoardDetail(
  boardId: string,
  board: BoardDoc,
  editors: Awaited<ReturnType<typeof resolveUserProfiles>>,
  readers: Awaited<ReturnType<typeof resolveUserProfiles>>
): BoardDetail {
  return {
    id: boardId,
    title: board.title,
    ownerId: board.ownerId,
    openEdit: board.openEdit,
    openRead: board.openRead,
    editorIds: board.editorIds,
    readerIds: board.readerIds,
    editors,
    readers,
    createdAt: toIsoDate(board.createdAt),
    updatedAt: toIsoDate(board.updatedAt)
  };
}

export async function GET(request: NextRequest, context: BoardRouteContext) {
  try {
    const user = await requireUser(request);
    const params = await context.params;
    const boardId = params.boardId?.trim();

    if (!boardId) {
      return NextResponse.json({ error: "Missing board id." }, { status: 400 });
    }

    const boardRef = getFirebaseAdminDb().collection("boards").doc(boardId);
    const boardSnapshot = await boardRef.get();

    if (!boardSnapshot.exists) {
      return NextResponse.json({ error: "Board not found." }, { status: 404 });
    }

    const board = parseBoardDoc(boardSnapshot.data());
    if (!board) {
      return NextResponse.json({ error: "Invalid board data." }, { status: 500 });
    }

    const permissions: BoardPermissions = {
      isOwner: board.ownerId === user.uid,
      canRead: canUserReadBoard(board, user.uid),
      canEdit: canUserEditBoard(board, user.uid)
    };

    if (!permissions.canRead) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const editors = permissions.isOwner ? await resolveUserProfiles(board.editorIds) : [];
    const readers = permissions.isOwner ? await resolveUserProfiles(board.readerIds) : [];

    return NextResponse.json({
      board: toBoardDetail(boardId, board, editors, readers),
      permissions
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to load board", error);
    return NextResponse.json(
      {
        error: "Failed to load board.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, context: BoardRouteContext) {
  try {
    assertFirestoreWritesAllowedInDev();

    const user = await requireUser(request);
    const params = await context.params;
    const boardId = params.boardId?.trim();

    if (!boardId) {
      return NextResponse.json({ error: "Missing board id." }, { status: 400 });
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

    if (board.ownerId !== user.uid) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    await boardRef.delete();

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to delete board", error);
    return NextResponse.json(
      {
        error: "Failed to delete board.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, context: BoardRouteContext) {
  try {
    assertFirestoreWritesAllowedInDev();

    const user = await requireUser(request);
    const params = await context.params;
    const boardId = params.boardId?.trim();

    if (!boardId) {
      return NextResponse.json({ error: "Missing board id." }, { status: 400 });
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

    if (board.ownerId !== user.uid) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    let requestBody: { title?: unknown } = {};
    try {
      requestBody = (await request.json()) as { title?: unknown };
    } catch {
      requestBody = {};
    }

    const title = parseBoardTitle(requestBody.title);
    if (!title) {
      return NextResponse.json({ error: "Board title is required." }, { status: 400 });
    }

    await boardRef.update({
      title,
      updatedAt: FieldValue.serverTimestamp()
    });

    const updatedSnapshot = await boardRef.get();
    const updatedBoard = parseBoardDoc(updatedSnapshot.data());
    if (!updatedBoard) {
      return NextResponse.json({ error: "Invalid board data." }, { status: 500 });
    }

    return NextResponse.json({
      board: toBoardDetail(updatedSnapshot.id, updatedBoard, [], [])
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to update board", error);
    return NextResponse.json(
      {
        error: "Failed to update board.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}
