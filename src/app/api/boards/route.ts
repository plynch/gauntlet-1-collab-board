import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { MAX_OWNED_BOARDS, type BoardSummary } from "@/features/boards/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardDoc = {
  title?: unknown;
  ownerId?: unknown;
  openEdit?: unknown;
  openRead?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function toIsoDate(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

function toBoardSummary(id: string, boardDoc: BoardDoc): BoardSummary {
  return {
    id,
    title: typeof boardDoc.title === "string" ? boardDoc.title : "Untitled board",
    ownerId: typeof boardDoc.ownerId === "string" ? boardDoc.ownerId : "",
    openEdit: Boolean(boardDoc.openEdit),
    openRead: Boolean(boardDoc.openRead),
    createdAt: toIsoDate(boardDoc.createdAt),
    updatedAt: toIsoDate(boardDoc.updatedAt)
  };
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

function boardSortValue(board: BoardSummary): number {
  const rawValue = board.updatedAt ?? board.createdAt;
  return rawValue ? Date.parse(rawValue) : 0;
}

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

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = getFirebaseAdminDb();

    const snapshot = await db
      .collection("boards")
      .where("ownerId", "==", user.uid)
      .get();

    const boards = snapshot.docs
      .map((doc) => toBoardSummary(doc.id, doc.data() as BoardDoc))
      .sort((left, right) => boardSortValue(right) - boardSortValue(left));

    return NextResponse.json({
      boards,
      maxOwnedBoards: MAX_OWNED_BOARDS
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to list boards", error);
    return NextResponse.json(
      {
        error: "Failed to list boards.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const db = getFirebaseAdminDb();

    const existingBoardsSnapshot = await db
      .collection("boards")
      .where("ownerId", "==", user.uid)
      .limit(MAX_OWNED_BOARDS)
      .get();

    if (existingBoardsSnapshot.size >= MAX_OWNED_BOARDS) {
      return NextResponse.json(
        {
          error: `Board limit reached. Max ${MAX_OWNED_BOARDS} owned boards per user.`
        },
        { status: 409 }
      );
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

    const boardRef = db.collection("boards").doc();

    await boardRef.set({
      title,
      ownerId: user.uid,
      openEdit: true,
      openRead: true,
      editorIds: [],
      readerIds: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });

    const createdSnapshot = await boardRef.get();
    const createdBoard = toBoardSummary(
      createdSnapshot.id,
      createdSnapshot.data() as BoardDoc
    );

    return NextResponse.json(
      {
        board: createdBoard
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to create board", error);
    return NextResponse.json(
      {
        error: "Failed to create board.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}
