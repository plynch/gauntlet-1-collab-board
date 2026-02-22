import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import { MAX_OWNED_BOARDS, type BoardSummary } from "@/features/boards/types";
import {
  assertFirestoreWritesAllowedInDev,
  getFirebaseAdminDb,
} from "@/lib/firebase/admin";
import { boardTitleBodySchema } from "@/server/api/board-route-schemas";
import { handleRouteError, readJsonBody } from "@/server/api/route-helpers";
import { requireUser } from "@/server/auth/require-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BOARD_LIMIT_REACHED_ERROR = "BOARD_LIMIT_REACHED";

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
    title:
      typeof boardDoc.title === "string" ? boardDoc.title : "Untitled board",
    ownerId: typeof boardDoc.ownerId === "string" ? boardDoc.ownerId : "",
    openEdit: Boolean(boardDoc.openEdit),
    openRead: Boolean(boardDoc.openRead),
    createdAt: toIsoDate(boardDoc.createdAt),
    updatedAt: toIsoDate(boardDoc.updatedAt),
  };
}

function boardSortValue(board: BoardSummary): number {
  const rawValue = board.updatedAt ?? board.createdAt;
  return rawValue ? Date.parse(rawValue) : 0;
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
      maxOwnedBoards: MAX_OWNED_BOARDS,
    });
  } catch (error) {
    console.error("Failed to list boards", error);
    return handleRouteError(error, "Failed to list boards.");
  }
}

export async function POST(request: NextRequest) {
  try {
    assertFirestoreWritesAllowedInDev();

    const user = await requireUser(request);
    const db = getFirebaseAdminDb();

    const bodyResult = await readJsonBody(request);
    if (!bodyResult.ok) {
      return bodyResult.response;
    }

    const parsedPayload = boardTitleBodySchema.safeParse(bodyResult.value);
    if (!parsedPayload.success) {
      return NextResponse.json(
        { error: "Board title is required." },
        { status: 400 },
      );
    }

    const title = parsedPayload.data.title;
    const boardRef = db.collection("boards").doc();
    const boardQuery = db
      .collection("boards")
      .where("ownerId", "==", user.uid)
      .limit(MAX_OWNED_BOARDS);

    try {
      await db.runTransaction(async (transaction) => {
        const existingBoardsSnapshot = await transaction.get(boardQuery);

        if (existingBoardsSnapshot.size >= MAX_OWNED_BOARDS) {
          throw new Error(BOARD_LIMIT_REACHED_ERROR);
        }

        transaction.set(boardRef, {
          title,
          ownerId: user.uid,
          openEdit: true,
          openRead: true,
          editorIds: [],
          readerIds: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === BOARD_LIMIT_REACHED_ERROR
      ) {
        return NextResponse.json(
          {
            error: `Board limit reached. Max ${MAX_OWNED_BOARDS} owned boards per user.`,
          },
          { status: 409 },
        );
      }
      throw error;
    }

    const createdSnapshot = await boardRef.get();
    const createdBoard = toBoardSummary(
      createdSnapshot.id,
      createdSnapshot.data() as BoardDoc,
    );

    return NextResponse.json(
      {
        board: createdBoard,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create board", error);
    return handleRouteError(error, "Failed to create board.");
  }
}
