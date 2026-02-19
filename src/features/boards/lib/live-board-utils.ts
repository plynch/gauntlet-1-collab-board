import { Timestamp } from "firebase/firestore";

import type {
  BoardDetail,
  BoardPermissions,
  BoardSummary,
} from "@/features/boards/types";

type RawBoardDoc = Record<string, unknown>;

export type LiveBoardDetail = Omit<BoardDetail, "editors" | "readers">;

/**
 * Handles to string array.
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * Handles to iso date.
 */
function toIsoDate(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

/**
 * Handles board sort value.
 */
export function boardSortValue(board: BoardSummary): number {
  const rawValue = board.updatedAt ?? board.createdAt;
  return rawValue ? Date.parse(rawValue) : 0;
}

/**
 * Handles to board summary.
 */
export function toBoardSummary(
  boardId: string,
  rawData: RawBoardDoc,
): BoardSummary {
  return {
    id: boardId,
    title: typeof rawData.title === "string" ? rawData.title : "Untitled board",
    ownerId: typeof rawData.ownerId === "string" ? rawData.ownerId : "",
    openEdit: Boolean(rawData.openEdit),
    openRead: Boolean(rawData.openRead),
    createdAt: toIsoDate(rawData.createdAt),
    updatedAt: toIsoDate(rawData.updatedAt),
  };
}

/**
 * Handles to live board detail.
 */
export function toLiveBoardDetail(
  boardId: string,
  rawData: RawBoardDoc,
): LiveBoardDetail | null {
  const ownerId = typeof rawData.ownerId === "string" ? rawData.ownerId : null;
  if (!ownerId) {
    return null;
  }

  const titleValue =
    typeof rawData.title === "string" ? rawData.title.trim() : "";

  return {
    id: boardId,
    title: titleValue.length > 0 ? titleValue : "Untitled board",
    ownerId,
    openEdit: Boolean(rawData.openEdit),
    openRead: Boolean(rawData.openRead),
    editorIds: toStringArray(rawData.editorIds),
    readerIds: toStringArray(rawData.readerIds),
    createdAt: toIsoDate(rawData.createdAt),
    updatedAt: toIsoDate(rawData.updatedAt),
  };
}

/**
 * Gets board permissions.
 */
export function getBoardPermissions(
  board: LiveBoardDetail,
  userUid: string,
): BoardPermissions {
  const isOwner = board.ownerId === userUid;
  const canEdit =
    board.openEdit || isOwner || board.editorIds.includes(userUid);
  const canRead =
    board.openRead || canEdit || board.readerIds.includes(userUid);

  return {
    isOwner,
    canRead,
    canEdit,
  };
}
