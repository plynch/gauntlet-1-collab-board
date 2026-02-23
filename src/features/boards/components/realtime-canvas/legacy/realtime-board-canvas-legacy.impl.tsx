"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  collection,
  doc,
} from "firebase/firestore";

import type {
  BoardObject,
  PresenceUser,
} from "@/features/boards/types";
import {
  AI_WELCOME_MESSAGE,
} from "@/features/boards/components/realtime-canvas/ai-chat-content";
import {
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { hashToColor } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import {
  AI_FOOTER_DEFAULT_HEIGHT,
  clampAiFooterHeight,
} from "@/features/boards/components/realtime-canvas/ai-footer-config";
import {
  getDistance,
  roundToStep,
  toNormalizedRect,
  ZOOM_SLIDER_MAX_PERCENT,
  ZOOM_SLIDER_MIN_PERCENT,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  GRID_CONTAINER_DEFAULT_GAP,
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
  INITIAL_VIEWPORT,
  OBJECT_LABEL_MAX_LENGTH,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
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
  RealtimeBoardCanvasProps,
  RotateState,
  StickyTextHoldDragState,
  StickyTextSyncState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useFpsMeter } from "@/features/boards/components/realtime-canvas/legacy/use-fps-meter";
import { useObjectTemplateActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-template-actions";
import { useBoardSelectionActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-selection-actions";
import { useAiCommandSubmit } from "@/features/boards/components/realtime-canvas/legacy/use-ai-command-submit";
import { useBoardStageInteractions } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-interactions";
import { useBoardStageWindowPointerEvents } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events";
import { RealtimeBoardCanvasLayout } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-layout";
import { useBoardAssistantActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-assistant-actions";
import {
  useContainerMembership,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  usePresenceClock,
} from "@/features/boards/components/realtime-canvas/use-presence-sync";
import {
  useAiChatState,
} from "@/features/boards/components/realtime-canvas/use-ai-chat-state";
import {
  useRealtimeBoardCanvasSubscriptionSync,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-subscription-sync";
import {
  createRealtimeWriteMetrics,
} from "@/features/boards/lib/realtime-write-metrics";
import { useBoardZoomControls } from "@/features/boards/components/realtime-canvas/legacy/use-board-zoom-controls";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { useRealtimeBoardCanvasRuntimeSync } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync";
import { useGridAxisLabels } from "@/features/boards/components/realtime-canvas/legacy/use-grid-axis-labels";
import { useGridDimensionUpdates } from "@/features/boards/components/realtime-canvas/legacy/use-grid-dimension-updates";
import { useSelectionGeometryActions } from "@/features/boards/components/realtime-canvas/legacy/use-selection-geometry-actions";
import { useGridContentSync } from "@/features/boards/components/realtime-canvas/legacy/use-grid-content-sync";
import { useObjectWriteActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-write-actions";
import { useStickyTextSync } from "@/features/boards/components/realtime-canvas/legacy/use-sticky-text-sync";
import { useDraftGeometryAndConnectors } from "@/features/boards/components/realtime-canvas/legacy/use-draft-geometry-and-connectors";
import { useResizeGeometry } from "@/features/boards/components/realtime-canvas/legacy/use-resize-geometry";
import { useSelectionStyleActions } from "@/features/boards/components/realtime-canvas/legacy/use-selection-style-actions";
import { useBoardRuntimeActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-runtime-actions";
import { useCanvasSelectionViewState } from "@/features/boards/components/realtime-canvas/legacy/use-canvas-selection-view-state";

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  const { resolvedTheme } = useTheme();
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

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
  const [cursorBoardPosition, setCursorBoardPosition] = useState<BoardPoint | null>(
    null,
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectionHudSize, setSelectionHudSize] = useState({
    width: 0,
    height: 0,
  });
  const fps = useFpsMeter();

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/objects`),
    [boardId, db],
  );
  const presenceCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/presence`),
    [boardId, db],
  );
  const selfPresenceRef = useMemo(
    () => doc(db, `boards/${boardId}/presence/${user.uid}`),
    [boardId, db, user.uid],
  );
  const snapToGridEnabledRef = useRef(isSnapToGridEnabled);

  const { clearStickyTextHoldDrag } = useRealtimeBoardCanvasRuntimeSync({
    boardId,
    canEdit,
    isSnapToGridEnabled,
    viewport,
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    gridContentDraftById,
    setGridContentDraftById,
    chatMessagesRef,
    chatMessages,
    hasAiDrawerBeenInteracted,
    isAiFooterCollapsed,
    isAiSubmitting,
    setIsAiDrawerNudgeActive,
    aiFooterHeight,
    setAiFooterHeight,
    setIsSnapToGridEnabled,
    stickyTextSyncStateRef,
    stageRef,
    setStageSize,
    writeMetricsRef,
    refs: {
      viewportRef,
      canEditRef,
      snapToGridEnabledRef,
      objectsByIdRef,
      lastPositionWriteByIdRef,
      lastGeometryWriteByIdRef,
      lastStickyWriteByIdRef,
      draftGeometryByIdRef,
      draftConnectorByIdRef,
      gridContentDraftByIdRef,
      gridContentSyncTimerByIdRef,
      selectedObjectIdsRef,
      stickyTextHoldDragRef,
      boardStatusTimerRef,
    },
  });

  useRealtimeBoardCanvasSubscriptionSync({
    boardId,
    user,
    boardColor,
    objectsCollectionRef,
    presenceCollectionRef,
    selfPresenceRef,
    setSelectedObjectIds,
    setObjects,
    setPresenceUsers,
    setBoardError,
    lastCursorWriteRef,
    idTokenRef,
  });

  const {
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    clearDraftConnector,
    getConnectorDraftForObject,
    resolveConnectorEndpoint,
    getResolvedConnectorEndpoints,
  } = useDraftGeometryAndConnectors({
    draftGeometryByIdRef,
    draftConnectorByIdRef,
    objectsByIdRef,
    setDraftGeometryById,
    setDraftConnectorById,
  });

  const {
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
  } = useContainerMembership({
    objectsByIdRef,
    getCurrentObjectGeometry,
    maxRows: GRID_CONTAINER_MAX_ROWS,
    maxCols: GRID_CONTAINER_MAX_COLS,
    defaultGap: GRID_CONTAINER_DEFAULT_GAP,
    getDistance,
    roundToStep,
    isConnectorKind,
  });

  const {
    updateObjectGeometry,
    updateConnectorDraft,
    updateObjectPositionsBatch,
  } = useObjectWriteActions({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    writeMetricsRef,
    lastGeometryWriteByIdRef,
    lastPositionWriteByIdRef,
    setBoardError,
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    resolveConnectorEndpoint,
  });

  const {
    getObjectsIntersectingRect,
    getConnectableAnchorPoints,
  } = useSelectionGeometryActions({
    objectsByIdRef,
    getCurrentObjectGeometry,
    getResolvedConnectorEndpoints,
  });

  const { getResizedGeometry, getLineGeometryFromEndpointDrag } =
    useResizeGeometry({
      snapToGridEnabledRef,
    });

  useBoardStageWindowPointerEvents({
    aiFooterResizeStateRef,
    cornerResizeStateRef,
    connectorEndpointDragStateRef,
    dragStateRef,
    lineEndpointResizeStateRef,
    marqueeSelectionStateRef,
    objectsByIdRef,
    panStateRef,
    rotateStateRef,
    stageRef,
    snapToGridEnabledRef,
    canEditRef,
    draftConnectorByIdRef,
    draftGeometryByIdRef,
    setDraftConnector,
    setDraftGeometry,
    setSelectedObjectIds,
    setIsObjectDragging,
    setMarqueeSelectionState,
    setIsAiFooterResizing,
    setAiFooterHeight,
    updateObjectGeometry,
    updateObjectPositionsBatch,
    updateConnectorDraft,
    clearDraftConnector,
    clearDraftGeometry,
    clearStickyTextHoldDrag,
    setViewport,
    getCurrentObjectGeometry,
    getConnectorDraftForObject,
    getConnectableAnchorPoints,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    getObjectsIntersectingRect,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    viewportRef,
    clampAiFooterHeight: clampAiFooterHeight,
  });

  const {
    updateCursor,
    createObject,
    showBoardStatus,
    createSwotTemplate,
    deleteObject,
  } = useBoardRuntimeActions({
    boardId,
    db,
    canEdit,
    userId: user.uid,
    objectsCollectionRef,
    selfPresenceRef,
    stageRef,
    viewportRef,
    objectsByIdRef,
    objectSpawnSequenceRef,
    snapToGridEnabledRef,
    stickyTextSyncStateRef,
    lastStickyWriteByIdRef,
    lastPositionWriteByIdRef,
    lastGeometryWriteByIdRef,
    gridContentSyncTimerByIdRef,
    lastCursorWriteRef,
    writeMetricsRef,
    setGridContentDraftById,
    setTextDrafts,
    setSelectedObjectIds,
    clearDraftConnector,
    setBoardError,
    setBoardStatusMessage,
    boardStatusTimerRef,
  });

  const {
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
  } = useObjectTemplateActions({
    canEdit,
    db,
    objectsCollectionRef,
    userId: user.uid,
    selectedObjectIds,
    objectsByIdRef,
    copiedObjectsRef,
    copyPasteSequenceRef,
    snapToGridEnabledRef,
    setSelectedObjectIds,
    setBoardError,
  });

  const { flushStickyTextSync, queueStickyTextSync } = useStickyTextSync({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    lastStickyWriteByIdRef,
    stickyTextSyncStateRef,
    writeMetricsRef,
    setBoardError,
  });

  const {
    getGridDraftForObject,
    queueGridContentSync,
    saveGridContainerCellColors,
  } = useGridContentSync({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    gridContentDraftByIdRef,
    gridContentSyncTimerByIdRef,
    setGridContentDraftById,
    setBoardError,
  });

  const { updateGridContainerDimensions } = useGridDimensionUpdates({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    getCurrentObjectGeometry,
    getGridDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    setGridContentDraftById,
    setBoardError,
  });

  const {
    saveSelectedObjectsColor,
    resetSelectedObjectsRotation,
    selectSingleObject,
    toggleObjectSelection,
    shouldPreserveGroupSelection,
  } = useSelectionStyleActions({
    boardId,
    db,
    canEditRef,
    selectedObjectIdsRef,
    objectsByIdRef,
    rotateStateRef,
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setSelectedObjectIds,
    setBoardError,
  });

  const {
    handleDeleteButtonClick,
    handleToolButtonClick,
    handleAiFooterResizeStart,
  } = useBoardSelectionActions({
    canEdit,
    objects,
    selectedObjectIds,
    selectedObjectIdsRef,
    copiedObjectsRef,
    setSelectedObjectIds,
    deleteObject,
    createObject,
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
    showBoardStatus,
    aiFooterHeight,
    isAiFooterCollapsed,
    aiFooterResizeStateRef,
    setIsAiFooterResizing,
  });

  const submitAiCommandMessage = useAiCommandSubmit({
    boardId,
    user,
    stageRef,
    viewportRef,
    objectsByIdRef,
    idTokenRef,
    selectedObjectIdsRef,
    isAiSubmitting,
    setIsAiSubmitting,
    setSelectedObjectIds,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
  });

  const {
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
  } = useBoardAssistantActions({
    canEdit,
    isAiSubmitting,
    isSwotTemplateCreating,
    setIsAiSubmitting,
    setIsSwotTemplateCreating,
    createSwotTemplate,
    appendAssistantMessage,
    setSelectedObjectIds,
    resetHistoryNavigation,
    submitAiCommandMessage,
    handleChatInputKeyDown,
    chatInput,
    boardId,
    objectsByIdRef,
    db,
    setObjects,
    setBoardError,
  });

  const {
    toBoardCoordinates,
    zoomAtStageCenter,
    nudgeZoom,
    handleWheel,
  } = useBoardZoomControls({
    stageRef,
    viewportRef,
    setViewport,
  });

  const handleStageWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      handleWheel(event);
    },
    [handleWheel],
  );

  const {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  } = useBoardStageInteractions({
    canEdit,
    setSelectedObjectIds,
    setMarqueeSelectionState,
    toBoardCoordinates,
    marqueeSelectionStateRef,
    panStateRef,
    viewportRef,
    objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef,
  });

  const {
    onlineUsers,
    remoteCursors,
    connectorEndpointDragObjectId,
    selectedObjectCount,
    connectorRoutesById,
    selectedColor,
    canColorSelection,
    canResetSelectionRotation,
    singleSelectedObject,
    canEditSelectedLabel,
    canShowSelectionHud,
    commitSelectionLabelDraft,
    selectionHudPosition,
    hasDeletableSelection,
    shouldShowConnectorAnchors,
    connectorAnchorPoints,
  } = useCanvasSelectionViewState({
    canEdit,
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    stageSize,
    viewport,
    connectorEndpointDragStateRef,
    getConnectableAnchorPoints,
    selectionLabelDraft,
    setSelectionLabelDraft,
    persistObjectLabelText,
    selectionHudSize,
    selectionHudRef,
    setSelectionHudSize,
    presenceUsers,
    presenceClock,
    userId: user.uid,
    objectLabelMaxLength: OBJECT_LABEL_MAX_LENGTH,
  });

  const zoomPercent = Math.round(viewport.scale * 100);
  const fpsTarget = 60;
  const fpsTone =
    fps >= 55 ? "#16a34a" : fps >= 45 ? "#d97706" : "#dc2626";
  const zoomSliderValue = Math.min(
    ZOOM_SLIDER_MAX_PERCENT,
    Math.max(ZOOM_SLIDER_MIN_PERCENT, zoomPercent),
  );
  const marqueeRect = marqueeSelectionState
    ? toNormalizedRect(
        marqueeSelectionState.startPoint,
        marqueeSelectionState.currentPoint,
      )
    : null;
  const gridAxisLabels = useGridAxisLabels(stageSize, viewport);

  return (
    <RealtimeBoardCanvasLayout
      isLeftPanelCollapsed={isLeftPanelCollapsed}
      isRightPanelCollapsed={isRightPanelCollapsed}
      canEdit={canEdit}
      isAiSubmitting={isAiSubmitting}
      isSwotTemplateCreating={isSwotTemplateCreating}
      hasDeletableSelection={hasDeletableSelection}
      selectedObjectCount={selectedObjectCount}
      resolvedTheme={resolvedTheme}
      onLeftCollapse={() => setIsLeftPanelCollapsed(true)}
      onLeftExpand={() => setIsLeftPanelCollapsed(false)}
      onToolButtonClick={handleToolButtonClick}
      onCreateSwot={handleCreateSwotButtonClick}
      onDuplicate={() => {
        void duplicateSelectedObjects();
      }}
      onDelete={handleDeleteButtonClick}
      leftControlsProps={{
        zoomSliderMin: ZOOM_SLIDER_MIN_PERCENT,
        zoomSliderMax: ZOOM_SLIDER_MAX_PERCENT,
        zoomSliderValue,
        zoomPercent,
        selectedObjectCount,
        isSnapToGridEnabled,
        cursorBoardPosition,
        boardError,
        boardStatusMessage,
        onResetView: () => setViewport(INITIAL_VIEWPORT),
        onNudgeZoomOut: () => nudgeZoom("out"),
        onNudgeZoomIn: () => nudgeZoom("in"),
        onZoomSliderChange: zoomAtStageCenter,
        onSnapToGridToggle: setIsSnapToGridEnabled,
      }}
      stageSurfaceProps={{
        stageRef,
        selectionHudRef,
        stageSize,
        viewport,
        gridAxisLabels,
        canEdit,
        isObjectDragging,
        objects,
        draftGeometryById,
        textDrafts,
        selectedObjectIds,
        connectorRoutesById,
        resolvedTheme,
        connectorEndpointDragObjectId,
        shouldShowConnectorAnchors,
        connectorAnchorPoints,
        marqueeRect,
        remoteCursors,
        fps,
        fpsTone,
        fpsTarget,
        canShowSelectionHud,
        selectionHudPosition,
        canColorSelection,
        selectedColor,
        canResetSelectionRotation,
        canEditSelectedLabel,
        selectionLabelDraft,
        singleSelectedObject,
        stickyTextHoldDragRef,
        handleStagePointerDown,
        handleStagePointerMove,
        handleStagePointerLeave,
        setSelectionLabelDraft,
        saveSelectedObjectsColor,
        resetSelectedObjectsRotation,
        commitSelectionLabelDraft,
        persistObjectLabelText,
        shouldPreserveGroupSelection,
        selectSingleObject,
        toggleObjectSelection,
        startObjectDrag,
        startShapeRotate,
        startCornerResize,
        startLineEndpointResize,
        startConnectorEndpointDrag,
        updateGridContainerDimensions,
        getGridDraftForObject,
        queueGridContentSync,
        saveGridContainerCellColors,
        clearStickyTextHoldDrag,
        setTextDrafts,
        queueStickyTextSync,
        flushStickyTextSync,
        handleWheel,
        onWheelCapture: handleStageWheelCapture,
      }}
      onlineUsers={onlineUsers}
      onRightCollapse={() => setIsRightPanelCollapsed(true)}
      onRightExpand={() => setIsRightPanelCollapsed(false)}
      aiFooterProps={{
        isCollapsed: isAiFooterCollapsed,
        isResizing: isAiFooterResizing,
        isDrawerNudgeActive: isAiDrawerNudgeActive,
        height: aiFooterHeight,
        selectedCount: selectedObjectIds.length,
        chatMessages,
        isSubmitting: isAiSubmitting,
        chatInput,
        chatMessagesRef,
        onResizeStart: handleAiFooterResizeStart,
        onToggleCollapsed: () => {
          setHasAiDrawerBeenInteracted(true);
          setIsAiFooterResizing(false);
          setIsAiFooterCollapsed((previous) => !previous);
        },
        onSubmit: handleAiChatSubmit,
        onInputChange: handleChatInputChange,
        onInputKeyDown: handleAiChatInputKeyDown,
      }}
    />
  );
}
