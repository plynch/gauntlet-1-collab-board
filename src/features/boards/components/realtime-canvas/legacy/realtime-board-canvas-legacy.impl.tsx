"use client";

import {
  useMemo,
} from "react";
import {
  collection,
  doc,
} from "firebase/firestore";

import { hashToColor } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import {
  toNormalizedRect,
  ZOOM_SLIDER_MAX_PERCENT,
  ZOOM_SLIDER_MIN_PERCENT,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  INITIAL_VIEWPORT,
  OBJECT_LABEL_MAX_LENGTH,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  RealtimeBoardCanvasProps,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useObjectTemplateActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-template-actions";
import { useBoardSelectionActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-selection-actions";
import { useAiCommandSubmit } from "@/features/boards/components/realtime-canvas/legacy/use-ai-command-submit";
import { RealtimeBoardCanvasLayout } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-layout";
import { useBoardAssistantActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-assistant-actions";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { useGridAxisLabels } from "@/features/boards/components/realtime-canvas/legacy/use-grid-axis-labels";
import { useGridDimensionUpdates } from "@/features/boards/components/realtime-canvas/legacy/use-grid-dimension-updates";
import { useGridContentSync } from "@/features/boards/components/realtime-canvas/legacy/use-grid-content-sync";
import { useStickyTextSync } from "@/features/boards/components/realtime-canvas/legacy/use-sticky-text-sync";
import { useSelectionStyleActions } from "@/features/boards/components/realtime-canvas/legacy/use-selection-style-actions";
import { useBoardRuntimeActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-runtime-actions";
import { useCanvasSelectionViewState } from "@/features/boards/components/realtime-canvas/legacy/use-canvas-selection-view-state";
import { useBoardStageActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-actions";
import { useLegacyCanvasState } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-state";
import { useLegacyCanvasRealtimeSync } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-realtime-sync";
import { useLegacyCanvasGeometryWiring } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-geometry-wiring";

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  const { resolvedTheme } = useTheme();
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

  const legacyCanvasState = useLegacyCanvasState({ canEdit });
  const { refs, state, chat } = legacyCanvasState;
  const {
    stageRef, selectionHudRef, chatMessagesRef, viewportRef, panStateRef, dragStateRef,
    cornerResizeStateRef, lineEndpointResizeStateRef, connectorEndpointDragStateRef,
    rotateStateRef, marqueeSelectionStateRef, aiFooterResizeStateRef, stickyTextHoldDragRef,
    idTokenRef, objectsByIdRef, objectSpawnSequenceRef, copiedObjectsRef, copyPasteSequenceRef,
    selectedObjectIdsRef, gridContentDraftByIdRef,
    stickyTextSyncStateRef, gridContentSyncTimerByIdRef, sendCursorAtRef, canEditRef,
    lastCursorWriteRef, lastPositionWriteByIdRef, lastGeometryWriteByIdRef, lastStickyWriteByIdRef,
    writeMetricsRef, boardStatusTimerRef, snapToGridEnabledRef,
  } = refs;
  const {
    viewport, setViewport, objects, setObjects, presenceUsers,
    textDrafts, setTextDrafts, draftGeometryById, draftConnectorById,
    setGridContentDraftById, selectedObjectIds,
    setSelectedObjectIds, marqueeSelectionState, setMarqueeSelectionState, boardError,
    setBoardError, boardStatusMessage, setBoardStatusMessage, isLeftPanelCollapsed,
    setIsLeftPanelCollapsed, isRightPanelCollapsed, setIsRightPanelCollapsed, isSnapToGridEnabled,
    setIsSnapToGridEnabled, isAiFooterCollapsed, setIsAiFooterCollapsed,
    setHasAiDrawerBeenInteracted, isAiDrawerNudgeActive,
    isAiFooterResizing, setIsAiFooterResizing, isObjectDragging, setIsObjectDragging,
    aiFooterHeight, isAiSubmitting, setIsAiSubmitting,
    isSwotTemplateCreating, setIsSwotTemplateCreating, selectionLabelDraft, setSelectionLabelDraft,
    cursorBoardPosition, setCursorBoardPosition, stageSize, selectionHudSize,
    setSelectionHudSize, fps, presenceClock,
  } = state;
  const {
    chatMessages, chatInput, appendUserMessage, appendAssistantMessage,
    clearChatInputForSubmit, resetHistoryNavigation, handleChatInputChange, handleChatInputKeyDown,
  } = chat;

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

  const { clearStickyTextHoldDrag } = useLegacyCanvasRealtimeSync({
    boardId,
    user,
    boardColor,
    canEdit,
    refs,
    state,
    chat,
    objectsCollectionRef,
    presenceCollectionRef,
    selfPresenceRef,
  });

  const {
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    clearDraftConnector,
    getConnectorDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    getConnectableAnchorPoints,
  } = useLegacyCanvasGeometryWiring({
    boardId,
    db,
    refs,
    state,
    clearStickyTextHoldDrag,
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
    zoomAtStageCenter,
    nudgeZoom,
    handleWheel,
    handleStageWheelCapture,
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  } = useBoardStageActions({
    canEdit,
    stageRef,
    viewportRef,
    setViewport,
    setSelectedObjectIds,
    setMarqueeSelectionState,
    marqueeSelectionStateRef,
    panStateRef,
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
