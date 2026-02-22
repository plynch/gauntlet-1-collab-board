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

export type BoardObjectKind =
  | "sticky"
  | "text"
  | "rect"
  | "circle"
  | "gridContainer"
  | "line"
  | "connectorUndirected"
  | "connectorArrow"
  | "connectorBidirectional"
  | "triangle"
  | "star";

export type ConnectorAnchor = "top" | "right" | "bottom" | "left";

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
  fromObjectId?: string | null;
  toObjectId?: string | null;
  fromAnchor?: ConnectorAnchor | null;
  toAnchor?: ConnectorAnchor | null;
  fromX?: number | null;
  fromY?: number | null;
  toX?: number | null;
  toY?: number | null;
  gridRows?: number | null;
  gridCols?: number | null;
  gridGap?: number | null;
  gridCellColors?: string[] | null;
  containerTitle?: string | null;
  gridSectionTitles?: string[] | null;
  gridSectionNotes?: string[] | null;
  containerId?: string | null;
  containerSectionIndex?: number | null;
  containerRelX?: number | null;
  containerRelY?: number | null;
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
