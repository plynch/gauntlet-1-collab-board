import { useRef, useState } from "react";

import { AI_WELCOME_MESSAGE } from "@/features/boards/components/realtime-canvas/ai-chat-content";
import { AI_FOOTER_DEFAULT_HEIGHT } from "@/features/boards/components/realtime-canvas/ai-footer-config";
import { INITIAL_VIEWPORT } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  AiFooterResizeState,
  BoardPoint,
  ConnectorDraft,
  ConnectorEndpointDragState,
  CornerResizeState,
  DragState,
  GridContainerContentDraft,
  LineEndpointResizeState,
  MarqueeSelectionState,
  ObjectGeometry,
  PanState,
  RotateState,
  StickyTextHoldDragState,
  StickyTextSyncState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useFpsMeter } from "@/features/boards/components/realtime-canvas/legacy/use-fps-meter";
import {
  useAiChatState,
} from "@/features/boards/components/realtime-canvas/use-ai-chat-state";
import { usePresenceClock } from "@/features/boards/components/realtime-canvas/use-presence-sync";
import type { BoardObject, PresenceUser } from "@/features/boards/types";
import {
  createRealtimeWriteMetrics,
} from "@/features/boards/lib/realtime-write-metrics";

export function useLegacyCanvasState({ canEdit }: { canEdit: boolean }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const selectionHudRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cornerResizeStateRef = useRef<CornerResizeState | null>(null);
  const lineEndpointResizeStateRef = useRef<LineEndpointResizeState | null>(
    null,
  );
  const connectorEndpointDragStateRef =
    useRef<ConnectorEndpointDragState | null>(null);
  const rotateStateRef = useRef<RotateState | null>(null);
  const marqueeSelectionStateRef = useRef<MarqueeSelectionState | null>(null);
  const aiFooterResizeStateRef = useRef<AiFooterResizeState | null>(null);
  const stickyTextHoldDragRef = useRef<StickyTextHoldDragState | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());
  const objectSpawnSequenceRef = useRef(0);
  const copiedObjectsRef = useRef<BoardObject[]>([]);
  const copyPasteSequenceRef = useRef(0);
  const selectedObjectIdsRef = useRef<Set<string>>(new Set());
  const draftGeometryByIdRef = useRef<Record<string, ObjectGeometry>>({});
  const draftConnectorByIdRef = useRef<Record<string, ConnectorDraft>>({});
  const gridContentDraftByIdRef = useRef<
    Record<string, GridContainerContentDraft>
  >({});
  const stickyTextSyncStateRef = useRef<Map<string, StickyTextSyncState>>(
    new Map(),
  );
  const gridContentSyncTimerByIdRef = useRef<Map<string, number>>(new Map());
  const sendCursorAtRef = useRef(0);
  const canEditRef = useRef(canEdit);
  const lastCursorWriteRef = useRef<BoardPoint | null>(null);
  const lastPositionWriteByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const lastGeometryWriteByIdRef = useRef<Map<string, ObjectGeometry>>(
    new Map(),
  );
  const lastStickyWriteByIdRef = useRef<Map<string, string>>(new Map());
  const writeMetricsRef = useRef(createRealtimeWriteMetrics());
  const boardStatusTimerRef = useRef<number | null>(null);

  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [draftGeometryById, setDraftGeometryById] = useState<
    Record<string, ObjectGeometry>
  >({});
  const [draftConnectorById, setDraftConnectorById] = useState<
    Record<string, ConnectorDraft>
  >({});
  const [gridContentDraftById, setGridContentDraftById] = useState<
    Record<string, GridContainerContentDraft>
  >({});
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [marqueeSelectionState, setMarqueeSelectionState] =
    useState<MarqueeSelectionState | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardStatusMessage, setBoardStatusMessage] = useState<string | null>(
    null,
  );
  const presenceClock = usePresenceClock(5_000);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isSnapToGridEnabled, setIsSnapToGridEnabled] = useState(true);
  const [isAiFooterCollapsed, setIsAiFooterCollapsed] = useState(true);
  const [hasAiDrawerBeenInteracted, setHasAiDrawerBeenInteracted] =
    useState(false);
  const [isAiDrawerNudgeActive, setIsAiDrawerNudgeActive] = useState(false);
  const [isAiFooterResizing, setIsAiFooterResizing] = useState(false);
  const [isObjectDragging, setIsObjectDragging] = useState(false);
  const [aiFooterHeight, setAiFooterHeight] = useState(
    AI_FOOTER_DEFAULT_HEIGHT,
  );
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [isSwotTemplateCreating, setIsSwotTemplateCreating] =
    useState(false);
  const {
    chatMessages,
    chatInput,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
    resetHistoryNavigation,
    handleChatInputChange,
    handleChatInputKeyDown,
  } = useAiChatState({
    welcomeMessage: AI_WELCOME_MESSAGE,
  });
  const [selectionLabelDraft, setSelectionLabelDraft] = useState("");
  const [cursorBoardPosition, setCursorBoardPosition] =
    useState<BoardPoint | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectionHudSize, setSelectionHudSize] = useState({
    width: 0,
    height: 0,
  });
  const fps = useFpsMeter();

  const snapToGridEnabledRef = useRef(isSnapToGridEnabled);

  return {
    refs: {
      stageRef,
      selectionHudRef,
      chatMessagesRef,
      viewportRef,
      panStateRef,
      dragStateRef,
      cornerResizeStateRef,
      lineEndpointResizeStateRef,
      connectorEndpointDragStateRef,
      rotateStateRef,
      marqueeSelectionStateRef,
      aiFooterResizeStateRef,
      stickyTextHoldDragRef,
      idTokenRef,
      objectsByIdRef,
      objectSpawnSequenceRef,
      copiedObjectsRef,
      copyPasteSequenceRef,
      selectedObjectIdsRef,
      draftGeometryByIdRef,
      draftConnectorByIdRef,
      gridContentDraftByIdRef,
      stickyTextSyncStateRef,
      gridContentSyncTimerByIdRef,
      sendCursorAtRef,
      canEditRef,
      lastCursorWriteRef,
      lastPositionWriteByIdRef,
      lastGeometryWriteByIdRef,
      lastStickyWriteByIdRef,
      writeMetricsRef,
      boardStatusTimerRef,
      snapToGridEnabledRef,
    },
    state: {
      viewport,
      setViewport,
      objects,
      setObjects,
      presenceUsers,
      setPresenceUsers,
      textDrafts,
      setTextDrafts,
      draftGeometryById,
      setDraftGeometryById,
      draftConnectorById,
      setDraftConnectorById,
      gridContentDraftById,
      setGridContentDraftById,
      selectedObjectIds,
      setSelectedObjectIds,
      marqueeSelectionState,
      setMarqueeSelectionState,
      boardError,
      setBoardError,
      boardStatusMessage,
      setBoardStatusMessage,
      isLeftPanelCollapsed,
      setIsLeftPanelCollapsed,
      isRightPanelCollapsed,
      setIsRightPanelCollapsed,
      isSnapToGridEnabled,
      setIsSnapToGridEnabled,
      isAiFooterCollapsed,
      setIsAiFooterCollapsed,
      hasAiDrawerBeenInteracted,
      setHasAiDrawerBeenInteracted,
      isAiDrawerNudgeActive,
      setIsAiDrawerNudgeActive,
      isAiFooterResizing,
      setIsAiFooterResizing,
      isObjectDragging,
      setIsObjectDragging,
      aiFooterHeight,
      setAiFooterHeight,
      isAiSubmitting,
      setIsAiSubmitting,
      isSwotTemplateCreating,
      setIsSwotTemplateCreating,
      selectionLabelDraft,
      setSelectionLabelDraft,
      cursorBoardPosition,
      setCursorBoardPosition,
      stageSize,
      setStageSize,
      selectionHudSize,
      setSelectionHudSize,
      fps,
      presenceClock,
    },
    chat: {
      chatMessages,
      chatInput,
      appendUserMessage,
      appendAssistantMessage,
      clearChatInputForSubmit,
      resetHistoryNavigation,
      handleChatInputChange,
      handleChatInputKeyDown,
    },
  };
}
