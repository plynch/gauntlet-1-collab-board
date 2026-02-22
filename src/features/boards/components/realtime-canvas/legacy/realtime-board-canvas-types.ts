import type { User } from "firebase/auth";

import type {
  BoardObjectKind,
  BoardPermissions,
  ConnectorAnchor,
} from "@/features/boards/types";
import type { ContainerMembershipPatch } from "@/features/boards/components/realtime-canvas/use-container-membership";

export type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

export type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

export type PanState = {
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
};

export type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

export type DragState = {
  objectIds: string[];
  initialGeometries: Record<string, ObjectGeometry>;
  startClientX: number;
  startClientY: number;
  lastSentAt: number;
  hasMoved: boolean;
  collapseToObjectIdOnClick: string | null;
};

export type AiFooterResizeState = {
  startClientY: number;
  initialHeight: number;
};

export type StickyTextHoldDragState = {
  objectId: string;
  startClientX: number;
  startClientY: number;
  timerId: number | null;
  started: boolean;
};

export type BoardPoint = {
  x: number;
  y: number;
};

export type MarqueeSelectionMode = "add" | "remove";

export type MarqueeSelectionState = {
  startPoint: BoardPoint;
  currentPoint: BoardPoint;
  mode: MarqueeSelectionMode;
};

export type ResizeCorner = "nw" | "ne" | "sw" | "se";
export type LineEndpoint = "start" | "end";
export type ConnectorEndpoint = "from" | "to";

export type ObjectWriteOptions = {
  includeUpdatedAt?: boolean;
  force?: boolean;
  containerMembershipById?: Record<string, ContainerMembershipPatch>;
};

export type CornerResizeState = {
  objectId: string;
  objectType: Exclude<
    BoardObjectKind,
    "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
  >;
  corner: ResizeCorner;
  startClientX: number;
  startClientY: number;
  initialGeometry: ObjectGeometry;
  lastSentAt: number;
};

export type LineEndpointResizeState = {
  objectId: string;
  endpoint: LineEndpoint;
  fixedPoint: BoardPoint;
  handleHeight: number;
  lastSentAt: number;
};

export type ConnectorEndpointDragState = {
  objectId: string;
  endpoint: ConnectorEndpoint;
  lastSentAt: number;
};

export type ConnectorDraft = {
  fromObjectId: string | null;
  toObjectId: string | null;
  fromAnchor: ConnectorAnchor | null;
  toAnchor: ConnectorAnchor | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export type RotateState = {
  objectId: string;
  centerPoint: BoardPoint;
  initialPointerAngleDeg: number;
  initialRotationDeg: number;
  lastSentAt: number;
};

export type StickyTextSyncState = {
  pendingText: string | null;
  lastSentAt: number;
  lastSentText: string | null;
  timerId: number | null;
};

export type GridContainerContentDraft = {
  containerTitle: string;
  sectionTitles: string[];
  sectionNotes: string[];
};
