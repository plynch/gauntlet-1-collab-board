import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import type { BoardObject } from "@/features/boards/types";
import type { ConnectorAnchor } from "@/features/boards/types";
import type { ContainerMembershipPatch } from "@/features/boards/components/realtime-canvas/use-container-membership";
import type {
  AiFooterResizeState,
  BoardPoint,
  ConnectorDraft,
  ConnectorEndpointDragState,
  CornerResizeState,
  DragState,
  LineEndpointResizeState,
  MarqueeSelectionState,
  ObjectGeometry,
  ObjectWriteOptions,
  PanState,
  RotateState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

export type UseBoardStageWindowPointerEventsParams = {
  stageRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportState>;
  aiFooterResizeStateRef: MutableRefObject<AiFooterResizeState | null>;
  cornerResizeStateRef: MutableRefObject<CornerResizeState | null>;
  connectorEndpointDragStateRef: MutableRefObject<ConnectorEndpointDragState | null>;
  lineEndpointResizeStateRef: MutableRefObject<LineEndpointResizeState | null>;
  rotateStateRef: MutableRefObject<RotateState | null>;
  marqueeSelectionStateRef: MutableRefObject<MarqueeSelectionState | null>;
  panStateRef: MutableRefObject<PanState | null>;
  dragStateRef: MutableRefObject<DragState | null>;
  snapToGridEnabledRef: MutableRefObject<boolean>;
  canEditRef: MutableRefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  draftGeometryByIdRef: MutableRefObject<Record<string, ObjectGeometry>>;
  draftConnectorByIdRef: MutableRefObject<Record<string, ConnectorDraft>>;
  setViewport: Dispatch<SetStateAction<ViewportState>>;
  setIsAiFooterResizing: Dispatch<SetStateAction<boolean>>;
  setDraftGeometry: (objectId: string, geometry: ObjectGeometry) => void;
  setDraftConnector: (objectId: string, draft: ConnectorDraft) => void;
  setMarqueeSelectionState: Dispatch<
    SetStateAction<MarqueeSelectionState | null>
  >;
  setIsObjectDragging: Dispatch<SetStateAction<boolean>>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  setAiFooterHeight: Dispatch<SetStateAction<number>>;
  clampAiFooterHeight: (nextHeight: number) => number;
  clearStickyTextHoldDrag: () => void;
  clearDraftGeometry: (objectId: string) => void;
  clearDraftConnector: (objectId: string) => void;
  getConnectableAnchorPoints: () => Array<{
    objectId: string;
    anchor: ConnectorAnchor;
    x: number;
    y: number;
  }>;
  getConnectorDraftForObject: (
    objectItem: BoardObject,
  ) => ConnectorDraft | null;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  getLineGeometryFromEndpointDrag: (
    state: LineEndpointResizeState,
    movingPoint: BoardPoint,
  ) => ObjectGeometry;
  getResizedGeometry: (
    state: CornerResizeState,
    clientX: number,
    clientY: number,
    scale: number,
  ) => ObjectGeometry;
  getObjectsIntersectingRect: (rect: {
    left: number;
    right: number;
    top: number;
    bottom: number;
  }) => string[];
  getSectionAnchoredObjectUpdatesForContainer: (
    containerId: string,
    nextContainerGeometry: ObjectGeometry,
    rows: number,
    cols: number,
    gap: number,
    options?: {
      clampToSectionBounds?: boolean;
      includeObjectsInNextBounds?: boolean;
    },
  ) => {
    positionByObjectId: Record<string, BoardPoint>;
    membershipByObjectId: Record<string, ContainerMembershipPatch>;
  };
  buildContainerMembershipPatchesForPositions: (
    nextPositionsById: Record<string, BoardPoint>,
    seedMembershipByObjectId: Record<
      string,
      ContainerMembershipPatch
    >,
  ) => Record<string, ContainerMembershipPatch>;
  updateConnectorDraft: (
    objectId: string,
    draft: ConnectorDraft,
    options?: ObjectWriteOptions,
  ) => Promise<void>;
  updateObjectGeometry: (
    objectId: string,
    geometry: ObjectGeometry,
    options?: ObjectWriteOptions,
  ) => Promise<void>;
  updateObjectPositionsBatch: (
    nextPositionsById: Record<string, BoardPoint>,
    options?: ObjectWriteOptions,
  ) => Promise<void>;
};
