/* eslint-disable @typescript-eslint/no-explicit-any */
import type { User } from "firebase/auth";
import type { CollectionReference, DocumentData, Firestore } from "firebase/firestore";

import { useObjectTemplateActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-template-actions";
import { useStickyTextSync } from "@/features/boards/components/realtime-canvas/legacy/use-sticky-text-sync";
import { useGridContentSync } from "@/features/boards/components/realtime-canvas/legacy/use-grid-content-sync";
import { useGridDimensionUpdates } from "@/features/boards/components/realtime-canvas/legacy/use-grid-dimension-updates";
import { useSelectionStyleActions } from "@/features/boards/components/realtime-canvas/legacy/use-selection-style-actions";
import { useBoardSelectionActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-selection-actions";
import { useAiCommandSubmit } from "@/features/boards/components/realtime-canvas/legacy/use-ai-command-submit";
import { useBoardAssistantActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-assistant-actions";
import { useBoardStageActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-actions";
import { useCanvasSelectionViewState } from "@/features/boards/components/realtime-canvas/legacy/use-canvas-selection-view-state";
import { OBJECT_LABEL_MAX_LENGTH } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { useLegacyCanvasState } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-state";

type LegacyCanvasStateShape = ReturnType<typeof useLegacyCanvasState>;

type UseLegacyCanvasUiWiringArgs = {
  boardId: string;
  user: User;
  canEdit: boolean;
  db: Firestore;
  objectsCollectionRef: CollectionReference<DocumentData>;
  refs: LegacyCanvasStateShape["refs"];
  state: LegacyCanvasStateShape["state"];
  chat: LegacyCanvasStateShape["chat"];
  createObject: (kind: any) => Promise<void>;
  createFrameObject: () => Promise<void>;
  showBoardStatus: (message: string) => void;
  createSwotTemplate: () => Promise<string | null>;
  deleteObject: (objectId: string) => Promise<void>;
  updateCursor: (cursor: any, options?: { force?: boolean }) => Promise<void>;
  getCurrentObjectGeometry: (objectId: string) => any;
  setDraftGeometry: (objectId: string, geometry: any) => void;
  clearDraftGeometry: (objectId: string) => void;
  setDraftConnector: (objectId: string, draft: any) => void;
  getConnectorDraftForObject: (objectItem: any) => any;
  getSectionAnchoredObjectUpdatesForContainer: (...args: any[]) => any;
  buildContainerMembershipPatchesForPositions: (...args: any[]) => any;
  updateObjectPositionsBatch: (...args: any[]) => Promise<void>;
  getConnectableAnchorPoints: () => Array<any>;
};

export function useLegacyCanvasUiWiring({
  boardId,
  user,
  canEdit,
  db,
  objectsCollectionRef,
  refs,
  state,
  chat,
  createObject,
  createFrameObject,
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
}: UseLegacyCanvasUiWiringArgs) {
  const {
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
  } = useObjectTemplateActions({
    canEdit,
    db,
    objectsCollectionRef,
    userId: user.uid,
    selectedObjectIds: state.selectedObjectIds,
    objectsByIdRef: refs.objectsByIdRef,
    copiedObjectsRef: refs.copiedObjectsRef,
    copyPasteSequenceRef: refs.copyPasteSequenceRef,
    snapToGridEnabledRef: refs.snapToGridEnabledRef,
    setSelectedObjectIds: state.setSelectedObjectIds,
    setBoardError: state.setBoardError,
  });

  const { flushStickyTextSync, queueStickyTextSync } = useStickyTextSync({
    boardId,
    db,
    canEditRef: refs.canEditRef,
    objectsByIdRef: refs.objectsByIdRef,
    lastStickyWriteByIdRef: refs.lastStickyWriteByIdRef,
    stickyTextSyncStateRef: refs.stickyTextSyncStateRef,
    writeMetricsRef: refs.writeMetricsRef,
    setBoardError: state.setBoardError,
  });

  const {
    getGridDraftForObject,
    queueGridContentSync,
    saveGridContainerCellColors,
  } = useGridContentSync({
    boardId,
    db,
    canEditRef: refs.canEditRef,
    objectsByIdRef: refs.objectsByIdRef,
    gridContentDraftByIdRef: refs.gridContentDraftByIdRef,
    gridContentSyncTimerByIdRef: refs.gridContentSyncTimerByIdRef,
    setGridContentDraftById: state.setGridContentDraftById,
    setBoardError: state.setBoardError,
  });

  const { updateGridContainerDimensions } = useGridDimensionUpdates({
    boardId,
    db,
    canEditRef: refs.canEditRef,
    objectsByIdRef: refs.objectsByIdRef,
    getCurrentObjectGeometry,
    getGridDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    setGridContentDraftById: state.setGridContentDraftById,
    setBoardError: state.setBoardError,
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
    canEditRef: refs.canEditRef,
    selectedObjectIdsRef: refs.selectedObjectIdsRef,
    objectsByIdRef: refs.objectsByIdRef,
    rotateStateRef: refs.rotateStateRef,
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setSelectedObjectIds: state.setSelectedObjectIds,
    setBoardError: state.setBoardError,
  });

  const {
    handleDeleteButtonClick,
    handleToolButtonClick,
    handleCreateFrameButtonClick,
    handleAiFooterResizeStart,
  } = useBoardSelectionActions({
    canEdit,
    objects: state.objects,
    selectedObjectIds: state.selectedObjectIds,
    selectedObjectIdsRef: refs.selectedObjectIdsRef,
    copiedObjectsRef: refs.copiedObjectsRef,
    setSelectedObjectIds: state.setSelectedObjectIds,
    deleteObject,
    createObject,
    createFrameObject,
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
    showBoardStatus,
    aiFooterHeight: state.aiFooterHeight,
    isAiFooterCollapsed: state.isAiFooterCollapsed,
    aiFooterResizeStateRef: refs.aiFooterResizeStateRef,
    setIsAiFooterResizing: state.setIsAiFooterResizing,
  });

  const submitAiCommandMessage = useAiCommandSubmit({
    boardId,
    user,
    stageRef: refs.stageRef,
    viewportRef: refs.viewportRef,
    objectsByIdRef: refs.objectsByIdRef,
    idTokenRef: refs.idTokenRef,
    selectedObjectIdsRef: refs.selectedObjectIdsRef,
    isAiSubmitting: state.isAiSubmitting,
    setIsAiSubmitting: state.setIsAiSubmitting,
    setSelectedObjectIds: state.setSelectedObjectIds,
    appendUserMessage: chat.appendUserMessage,
    appendAssistantMessage: chat.appendAssistantMessage,
    clearChatInputForSubmit: chat.clearChatInputForSubmit,
  });

  const {
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
  } = useBoardAssistantActions({
    canEdit,
    isAiSubmitting: state.isAiSubmitting,
    isSwotTemplateCreating: state.isSwotTemplateCreating,
    setIsAiSubmitting: state.setIsAiSubmitting,
    setIsSwotTemplateCreating: state.setIsSwotTemplateCreating,
    createSwotTemplate,
    appendAssistantMessage: chat.appendAssistantMessage,
    setSelectedObjectIds: state.setSelectedObjectIds,
    resetHistoryNavigation: chat.resetHistoryNavigation,
    submitAiCommandMessage,
    handleChatInputKeyDown: chat.handleChatInputKeyDown,
    chatInput: chat.chatInput,
    boardId,
    objectsByIdRef: refs.objectsByIdRef,
    db,
    setObjects: state.setObjects,
    setBoardError: state.setBoardError,
  });

  const stageActions = useBoardStageActions({
    canEdit,
    stageRef: refs.stageRef,
    viewportRef: refs.viewportRef,
    setViewport: state.setViewport,
    setSelectedObjectIds: state.setSelectedObjectIds,
    setMarqueeSelectionState: state.setMarqueeSelectionState,
    marqueeSelectionStateRef: refs.marqueeSelectionStateRef,
    panStateRef: refs.panStateRef,
    objectsByIdRef: refs.objectsByIdRef,
    selectedObjectIdsRef: refs.selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef: refs.dragStateRef,
    setIsObjectDragging: state.setIsObjectDragging,
    rotateStateRef: refs.rotateStateRef,
    cornerResizeStateRef: refs.cornerResizeStateRef,
    lineEndpointResizeStateRef: refs.lineEndpointResizeStateRef,
    connectorEndpointDragStateRef: refs.connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition: state.setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef: refs.sendCursorAtRef,
  });

  const selectionViewState = useCanvasSelectionViewState({
    canEdit,
    objects: state.objects,
    draftGeometryById: state.draftGeometryById,
    draftConnectorById: state.draftConnectorById,
    selectedObjectIds: state.selectedObjectIds,
    stageSize: state.stageSize,
    viewport: state.viewport,
    connectorEndpointDragStateRef: refs.connectorEndpointDragStateRef,
    getConnectableAnchorPoints,
    selectionLabelDraft: state.selectionLabelDraft,
    setSelectionLabelDraft: state.setSelectionLabelDraft,
    persistObjectLabelText,
    selectionHudSize: state.selectionHudSize,
    selectionHudRef: refs.selectionHudRef,
    setSelectionHudSize: state.setSelectionHudSize,
    presenceUsers: state.presenceUsers,
    presenceClock: state.presenceClock,
    userId: user.uid,
    objectLabelMaxLength: OBJECT_LABEL_MAX_LENGTH,
  });

  return {
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
    handleCreateFrameButtonClick,
    handleAiFooterResizeStart,
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
    ...stageActions,
    ...selectionViewState,
  };
}
