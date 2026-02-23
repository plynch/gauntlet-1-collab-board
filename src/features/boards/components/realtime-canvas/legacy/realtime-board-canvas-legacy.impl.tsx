"use client";

import { useMemo } from "react";
import { collection, doc } from "firebase/firestore";

import { hashToColor } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import { toNormalizedRect, ZOOM_SLIDER_MAX_PERCENT, ZOOM_SLIDER_MIN_PERCENT } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { INITIAL_VIEWPORT } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { RealtimeBoardCanvasProps } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { RealtimeBoardCanvasLayout } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-layout";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { useGridAxisLabels } from "@/features/boards/components/realtime-canvas/legacy/use-grid-axis-labels";
import { useBoardRuntimeActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-runtime-actions";
import { useLegacyCanvasState } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-state";
import { useLegacyCanvasRealtimeSync } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-realtime-sync";
import { useLegacyCanvasGeometryWiring } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-geometry-wiring";
import { useLegacyCanvasUiWiring } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-ui-wiring";

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
    stageRef, selectionHudRef, chatMessagesRef, viewportRef, stickyTextHoldDragRef,
    objectsByIdRef, objectSpawnSequenceRef,
    stickyTextSyncStateRef, gridContentSyncTimerByIdRef,
    lastCursorWriteRef, lastPositionWriteByIdRef, lastGeometryWriteByIdRef, lastStickyWriteByIdRef,
    writeMetricsRef, boardStatusTimerRef, snapToGridEnabledRef,
  } = refs;
  const {
    viewport, setViewport, objects,
    textDrafts, setTextDrafts, draftGeometryById,
    setGridContentDraftById, selectedObjectIds,
    setSelectedObjectIds, marqueeSelectionState, boardError,
    setBoardError, boardStatusMessage, setBoardStatusMessage, isLeftPanelCollapsed,
    setIsLeftPanelCollapsed, isRightPanelCollapsed, setIsRightPanelCollapsed, isSnapToGridEnabled,
    setIsSnapToGridEnabled, isAiFooterCollapsed, setIsAiFooterCollapsed,
    setHasAiDrawerBeenInteracted, isAiDrawerNudgeActive,
    isAiFooterResizing, setIsAiFooterResizing, isObjectDragging,
    aiFooterHeight, isAiSubmitting,
    isSwotTemplateCreating, selectionLabelDraft, setSelectionLabelDraft,
    cursorBoardPosition, stageSize, fps,
  } = state;
  const {
    chatMessages, chatInput, handleChatInputChange,
  } = chat;

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(() => collection(db, `boards/${boardId}/objects`), [boardId, db]);
  const presenceCollectionRef = useMemo(() => collection(db, `boards/${boardId}/presence`), [boardId, db]);
  const selfPresenceRef = useMemo(() => doc(db, `boards/${boardId}/presence/${user.uid}`), [boardId, db, user.uid]);

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
    duplicateSelectedObjects,
    flushStickyTextSync,
    queueStickyTextSync,
    getGridDraftForObject,
    queueGridContentSync,
    saveGridContainerCellColors,
    updateGridContainerDimensions,
    saveSelectedObjectsColor,
    resetSelectedObjectsRotation,
    selectSingleObject,
    toggleObjectSelection,
    shouldPreserveGroupSelection,
    handleDeleteButtonClick,
    handleToolButtonClick,
    handleAiFooterResizeStart,
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
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
  } = useLegacyCanvasUiWiring({
    boardId,
    user,
    canEdit,
    db,
    objectsCollectionRef,
    refs,
    state,
    chat,
    createObject,
    showBoardStatus,
    createSwotTemplate,
    deleteObject,
    updateCursor,
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    getConnectorDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    getConnectableAnchorPoints,
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
      isLeftPanelCollapsed={isLeftPanelCollapsed} isRightPanelCollapsed={isRightPanelCollapsed} canEdit={canEdit}
      isAiSubmitting={isAiSubmitting} isSwotTemplateCreating={isSwotTemplateCreating} hasDeletableSelection={hasDeletableSelection}
      selectedObjectCount={selectedObjectCount} resolvedTheme={resolvedTheme}
      onLeftCollapse={() => setIsLeftPanelCollapsed(true)} onLeftExpand={() => setIsLeftPanelCollapsed(false)}
      onToolButtonClick={handleToolButtonClick} onCreateSwot={handleCreateSwotButtonClick}
      onDuplicate={() => { void duplicateSelectedObjects(); }} onDelete={handleDeleteButtonClick}
      leftControlsProps={{ zoomSliderMin: ZOOM_SLIDER_MIN_PERCENT, zoomSliderMax: ZOOM_SLIDER_MAX_PERCENT, zoomSliderValue, zoomPercent, selectedObjectCount, isSnapToGridEnabled, cursorBoardPosition, boardError, boardStatusMessage, onResetView: () => setViewport(INITIAL_VIEWPORT), onNudgeZoomOut: () => nudgeZoom("out"), onNudgeZoomIn: () => nudgeZoom("in"), onZoomSliderChange: zoomAtStageCenter, onSnapToGridToggle: setIsSnapToGridEnabled }}
      stageSurfaceProps={{
        stageRef, selectionHudRef, stageSize, viewport, gridAxisLabels, canEdit, isObjectDragging, objects,
        draftGeometryById, textDrafts, selectedObjectIds, connectorRoutesById, resolvedTheme, connectorEndpointDragObjectId,
        shouldShowConnectorAnchors, connectorAnchorPoints, marqueeRect, remoteCursors, fps, fpsTone, fpsTarget,
        canShowSelectionHud, selectionHudPosition, canColorSelection, selectedColor, canResetSelectionRotation,
        canEditSelectedLabel, selectionLabelDraft, singleSelectedObject, stickyTextHoldDragRef, handleStagePointerDown,
        handleStagePointerMove, handleStagePointerLeave, setSelectionLabelDraft, saveSelectedObjectsColor,
        resetSelectedObjectsRotation, commitSelectionLabelDraft, persistObjectLabelText, shouldPreserveGroupSelection,
        selectSingleObject, toggleObjectSelection, startObjectDrag, startShapeRotate, startCornerResize,
        startLineEndpointResize, startConnectorEndpointDrag, updateGridContainerDimensions, getGridDraftForObject,
        queueGridContentSync, saveGridContainerCellColors, clearStickyTextHoldDrag, setTextDrafts,
        queueStickyTextSync, flushStickyTextSync, handleWheel, onWheelCapture: handleStageWheelCapture,
      }}
      onlineUsers={onlineUsers} onRightCollapse={() => setIsRightPanelCollapsed(true)} onRightExpand={() => setIsRightPanelCollapsed(false)}
      aiFooterProps={{
        isCollapsed: isAiFooterCollapsed, isResizing: isAiFooterResizing, isDrawerNudgeActive: isAiDrawerNudgeActive,
        height: aiFooterHeight, selectedCount: selectedObjectIds.length, chatMessages, isSubmitting: isAiSubmitting,
        chatInput, chatMessagesRef, onResizeStart: handleAiFooterResizeStart,
        onToggleCollapsed: () => { setHasAiDrawerBeenInteracted(true); setIsAiFooterResizing(false); setIsAiFooterCollapsed((previous) => !previous); },
        onSubmit: handleAiChatSubmit, onInputChange: handleChatInputChange, onInputKeyDown: handleAiChatInputKeyDown,
      }}
    />
  );
}
