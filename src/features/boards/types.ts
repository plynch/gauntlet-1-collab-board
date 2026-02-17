export const MAX_OWNED_BOARDS = 3;

export type BoardSummary = {
  id: string;
  title: string;
  ownerId: string;
  openEdit: boolean;
  openRead: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type BoardEditorProfile = {
  uid: string;
  email: string | null;
  displayName: string | null;
};

export type BoardDetail = BoardSummary & {
  editorIds: string[];
  readerIds: string[];
  editors: BoardEditorProfile[];
  readers: BoardEditorProfile[];
};

export type BoardPermissions = {
  isOwner: boolean;
  canRead: boolean;
  canEdit: boolean;
};

export type BoardObjectKind = "sticky" | "rect" | "circle" | "line";

export type BoardObject = {
  id: string;
  type: BoardObjectKind;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
  updatedAt: string | null;
};

export type PresenceUser = {
  uid: string;
  displayName: string | null;
  email: string | null;
  color: string;
  cursorX: number | null;
  cursorY: number | null;
  active: boolean;
  lastSeenAt: number | null;
};
