"use client";

import type {
  Dispatch,
  MutableRefObject,
  RefObject,
  SetStateAction,
} from "react";

import type { ChatMessage } from "@/features/boards/components/realtime-canvas/ai-chat-content";
import type { BoardObject } from "@/features/boards/types";
import type {
  BoardPoint,
  ConnectorDraft,
  GridContainerContentDraft,
  ObjectGeometry,
  StickyTextHoldDragState,
  StickyTextSyncState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

export type RealtimeBoardCanvasRuntimeSyncRefs = {
  viewportRef: RefObject<ViewportState>;
  canEditRef: MutableRefObject<boolean>;
  snapToGridEnabledRef: RefObject<boolean>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  lastPositionWriteByIdRef: RefObject<Map<string, BoardPoint>>;
  lastGeometryWriteByIdRef: MutableRefObject<Map<string, ObjectGeometry>>;
  lastStickyWriteByIdRef: MutableRefObject<Map<string, string>>;
  draftGeometryByIdRef: MutableRefObject<Record<string, ObjectGeometry>>;
  draftConnectorByIdRef: MutableRefObject<Record<string, ConnectorDraft>>;
  gridContentDraftByIdRef: MutableRefObject<
    Record<string, GridContainerContentDraft>
  >;
  gridContentSyncTimerByIdRef: MutableRefObject<Map<string, number>>;
  selectedObjectIdsRef: RefObject<Set<string>>;
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  boardStatusTimerRef: MutableRefObject<number | null>;
};

export type RealtimeBoardCanvasRuntimeSyncProps = {
  boardId: string;
  canEdit: boolean;
  isSnapToGridEnabled: boolean;
  viewport: ViewportState;
  objects: BoardObject[];
  draftGeometryById: Record<string, ObjectGeometry>;
  draftConnectorById: Record<string, ConnectorDraft>;
  selectedObjectIds: string[];
  gridContentDraftById: Record<string, GridContainerContentDraft>;
  setGridContentDraftById: Dispatch<
    SetStateAction<Record<string, GridContainerContentDraft>>
  >;
  chatMessagesRef: RefObject<HTMLDivElement | null>;
  chatMessages: ChatMessage[];
  hasAiDrawerBeenInteracted: boolean;
  isAiFooterCollapsed: boolean;
  isAiSubmitting: boolean;
  setIsAiDrawerNudgeActive: Dispatch<SetStateAction<boolean>>;
  aiFooterHeight: number;
  setAiFooterHeight: Dispatch<SetStateAction<number>>;
  setIsSnapToGridEnabled: Dispatch<SetStateAction<boolean>>;
  stickyTextSyncStateRef: MutableRefObject<Map<string, StickyTextSyncState>>;
  stageRef: RefObject<HTMLDivElement | null>;
  setStageSize: Dispatch<
    SetStateAction<{ width: number; height: number }>
  >;
  writeMetricsRef: MutableRefObject<{
    snapshot: () => unknown;
  }>;
  refs: RealtimeBoardCanvasRuntimeSyncRefs;
};

export type RealtimeBoardCanvasRuntimeSyncResult = {
  clearStickyTextHoldDrag: () => void;
};
