import { FieldValue } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";

import type { BoardDetail } from "@/features/boards/types";
import { getFirebaseAdminAuth, getFirebaseAdminDb } from "@/lib/firebase/admin";
import { AuthError, requireUser } from "@/server/auth/require-user";
import {
  parseBoardDoc,
  resolveUserProfiles,
  toIsoDate,
  type BoardDoc
} from "@/server/boards/board-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BoardAccessRouteContext = {
  params: Promise<{
    boardId: string;
  }>;
};

type SetOpenEditAction = {
  action: "set-open-edit";
  openEdit: boolean;
};

type SetOpenReadAction = {
  action: "set-open-read";
  openRead: boolean;
};

type AddEditorAction = {
  action: "add-editor";
  editorEmail: string;
};

type RemoveEditorAction = {
  action: "remove-editor";
  editorUid: string;
};

type AddReaderAction = {
  action: "add-reader";
  readerEmail: string;
};

type RemoveReaderAction = {
  action: "remove-reader";
  readerUid: string;
};

type AccessAction =
  | SetOpenEditAction
  | SetOpenReadAction
  | AddEditorAction
  | RemoveEditorAction
  | AddReaderAction
  | RemoveReaderAction;

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

function isAccessAction(input: unknown): input is AccessAction {
  if (!input || typeof input !== "object") {
    return false;
  }

  const action = (input as { action?: unknown }).action;
  return (
    action === "set-open-edit" ||
    action === "set-open-read" ||
    action === "add-editor" ||
    action === "remove-editor" ||
    action === "add-reader" ||
    action === "remove-reader"
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function PATCH(request: NextRequest, context: BoardAccessRouteContext) {
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

    if (!isAccessAction(payload)) {
      return NextResponse.json({ error: "Invalid access action." }, { status: 400 });
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
      return NextResponse.json({ error: "Only the owner can update access." }, { status: 403 });
    }

    if (payload.action === "set-open-edit") {
      await boardRef.update({
        openEdit: payload.openEdit,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (payload.action === "set-open-read") {
      await boardRef.update({
        openRead: payload.openRead,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (payload.action === "add-editor") {
      const email = normalizeEmail(payload.editorEmail);
      if (!email) {
        return NextResponse.json({ error: "Editor email is required." }, { status: 400 });
      }

      const editorUser = await getFirebaseAdminAuth()
        .getUserByEmail(email)
        .catch(() => null);

      if (!editorUser) {
        return NextResponse.json(
          {
            error:
              "No Firebase user found for that email. They must sign in at least once first."
          },
          { status: 404 }
        );
      }

      if (editorUser.uid === board.ownerId) {
        return NextResponse.json(
          { error: "Owner does not need to be added as an editor." },
          { status: 400 }
        );
      }

      await boardRef.update({
        editorIds: FieldValue.arrayUnion(editorUser.uid),
        readerIds: FieldValue.arrayRemove(editorUser.uid),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (payload.action === "remove-editor") {
      const editorUid = payload.editorUid.trim();
      if (!editorUid) {
        return NextResponse.json({ error: "Editor uid is required." }, { status: 400 });
      }

      if (editorUid === board.ownerId) {
        return NextResponse.json(
          { error: "Owner cannot be removed from editors." },
          { status: 400 }
        );
      }

      await boardRef.update({
        editorIds: FieldValue.arrayRemove(editorUid),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (payload.action === "add-reader") {
      const email = normalizeEmail(payload.readerEmail);
      if (!email) {
        return NextResponse.json({ error: "Reader email is required." }, { status: 400 });
      }

      const readerUser = await getFirebaseAdminAuth()
        .getUserByEmail(email)
        .catch(() => null);

      if (!readerUser) {
        return NextResponse.json(
          {
            error:
              "No Firebase user found for that email. They must sign in at least once first."
          },
          { status: 404 }
        );
      }

      if (readerUser.uid === board.ownerId) {
        return NextResponse.json(
          { error: "Owner does not need to be added as a reader." },
          { status: 400 }
        );
      }

      if (board.editorIds.includes(readerUser.uid)) {
        return NextResponse.json(
          { error: "User already has edit access. Remove edit access before adding reader access." },
          { status: 409 }
        );
      }

      await boardRef.update({
        readerIds: FieldValue.arrayUnion(readerUser.uid),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    if (payload.action === "remove-reader") {
      const readerUid = payload.readerUid.trim();
      if (!readerUid) {
        return NextResponse.json({ error: "Reader uid is required." }, { status: 400 });
      }

      if (readerUid === board.ownerId) {
        return NextResponse.json(
          { error: "Owner cannot be removed from readers." },
          { status: 400 }
        );
      }

      await boardRef.update({
        readerIds: FieldValue.arrayRemove(readerUid),
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    const updatedSnapshot = await boardRef.get();
    const updatedBoard = parseBoardDoc(updatedSnapshot.data());

    if (!updatedBoard) {
      return NextResponse.json({ error: "Updated board data is invalid." }, { status: 500 });
    }

    const editors = await resolveUserProfiles(updatedBoard.editorIds);
    const readers = await resolveUserProfiles(updatedBoard.readerIds);

    return NextResponse.json({
      board: toBoardDetail(boardId, updatedBoard, editors, readers)
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Failed to update board access", error);
    return NextResponse.json(
      {
        error: "Failed to update board access.",
        debug: getDebugMessage(error)
      },
      { status: 500 }
    );
  }
}
