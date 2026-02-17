import type { UserRecord } from "firebase-admin/auth";
import { Timestamp } from "firebase-admin/firestore";

import { getFirebaseAdminAuth } from "@/lib/firebase/admin";

export type BoardDoc = {
  title: string;
  ownerId: string;
  openEdit: boolean;
  openRead: boolean;
  editorIds: string[];
  readerIds: string[];
  createdAt: unknown;
  updatedAt: unknown;
};

export type BoardEditorProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function parseBoardDoc(raw: unknown): BoardDoc | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const ownerId = typeof candidate.ownerId === "string" ? candidate.ownerId : null;

  if (!ownerId) {
    return null;
  }

  const titleValue = typeof candidate.title === "string" ? candidate.title.trim() : "";

  return {
    title: titleValue.length > 0 ? titleValue : "Untitled board",
    ownerId,
    openEdit: Boolean(candidate.openEdit),
    openRead: Boolean(candidate.openRead),
    editorIds: toStringArray(candidate.editorIds),
    readerIds: toStringArray(candidate.readerIds),
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt
  };
}

export function toIsoDate(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

export function canUserReadBoard(board: BoardDoc, userUid: string): boolean {
  return (
    board.openRead ||
    board.openEdit ||
    board.ownerId === userUid ||
    board.readerIds.includes(userUid) ||
    board.editorIds.includes(userUid)
  );
}

export function canUserEditBoard(board: BoardDoc, userUid: string): boolean {
  return (
    board.openEdit || board.ownerId === userUid || board.editorIds.includes(userUid)
  );
}

export async function resolveEditorProfiles(
  editorIds: string[]
): Promise<BoardEditorProfile[]> {
  if (editorIds.length === 0) {
    return [];
  }

  try {
    const auth = getFirebaseAdminAuth();
    const usersResult = await auth.getUsers(editorIds.map((uid) => ({ uid })));

    const usersByUid = new Map<string, UserRecord>(
      usersResult.users.map((user) => [user.uid, user])
    );

    return editorIds.map((uid) => {
      const user = usersByUid.get(uid);
      return {
        uid,
        email: user?.email ?? null,
        displayName: user?.displayName ?? null
      };
    });
  } catch {
    return editorIds.map((uid) => ({
      uid,
      email: null,
      displayName: null
    }));
  }
}
