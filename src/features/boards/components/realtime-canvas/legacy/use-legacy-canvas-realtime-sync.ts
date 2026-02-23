import type { CollectionReference, DocumentReference, DocumentData } from "firebase/firestore";
import type { User } from "firebase/auth";

import {
  useRealtimeBoardCanvasSubscriptionSync,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-subscription-sync";
import { useRealtimeBoardCanvasRuntimeSync } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync";
import { useLegacyCanvasState } from "@/features/boards/components/realtime-canvas/legacy/use-legacy-canvas-state";

type LegacyCanvasStateShape = ReturnType<typeof useLegacyCanvasState>;

type UseLegacyCanvasRealtimeSyncArgs = {
  boardId: string;
  user: User;
  boardColor: string;
  canEdit: boolean;
  refs: LegacyCanvasStateShape["refs"];
  state: LegacyCanvasStateShape["state"];
  chat: LegacyCanvasStateShape["chat"];
  objectsCollectionRef: CollectionReference<DocumentData>;
  presenceCollectionRef: CollectionReference<DocumentData>;
  selfPresenceRef: DocumentReference<DocumentData>;
};

export function useLegacyCanvasRealtimeSync({
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
}: UseLegacyCanvasRealtimeSyncArgs) {
  const { clearStickyTextHoldDrag } = useRealtimeBoardCanvasRuntimeSync({
    boardId,
    canEdit,
    isSnapToGridEnabled: state.isSnapToGridEnabled,
    viewport: state.viewport,
    objects: state.objects,
    draftGeometryById: state.draftGeometryById,
    draftConnectorById: state.draftConnectorById,
    selectedObjectIds: state.selectedObjectIds,
    gridContentDraftById: state.gridContentDraftById,
    setGridContentDraftById: state.setGridContentDraftById,
    chatMessagesRef: refs.chatMessagesRef,
    chatMessages: chat.chatMessages,
    hasAiDrawerBeenInteracted: state.hasAiDrawerBeenInteracted,
    isAiFooterCollapsed: state.isAiFooterCollapsed,
    isAiSubmitting: state.isAiSubmitting,
    setIsAiDrawerNudgeActive: state.setIsAiDrawerNudgeActive,
    aiFooterHeight: state.aiFooterHeight,
    setAiFooterHeight: state.setAiFooterHeight,
    setIsSnapToGridEnabled: state.setIsSnapToGridEnabled,
    stickyTextSyncStateRef: refs.stickyTextSyncStateRef,
    stageRef: refs.stageRef,
    setStageSize: state.setStageSize,
    writeMetricsRef: refs.writeMetricsRef,
    refs: {
      viewportRef: refs.viewportRef,
      canEditRef: refs.canEditRef,
      snapToGridEnabledRef: refs.snapToGridEnabledRef,
      objectsByIdRef: refs.objectsByIdRef,
      lastPositionWriteByIdRef: refs.lastPositionWriteByIdRef,
      lastGeometryWriteByIdRef: refs.lastGeometryWriteByIdRef,
      lastStickyWriteByIdRef: refs.lastStickyWriteByIdRef,
      draftGeometryByIdRef: refs.draftGeometryByIdRef,
      draftConnectorByIdRef: refs.draftConnectorByIdRef,
      gridContentDraftByIdRef: refs.gridContentDraftByIdRef,
      gridContentSyncTimerByIdRef: refs.gridContentSyncTimerByIdRef,
      selectedObjectIdsRef: refs.selectedObjectIdsRef,
      stickyTextHoldDragRef: refs.stickyTextHoldDragRef,
      boardStatusTimerRef: refs.boardStatusTimerRef,
    },
  });

  useRealtimeBoardCanvasSubscriptionSync({
    boardId,
    user,
    boardColor,
    objectsCollectionRef,
    presenceCollectionRef,
    selfPresenceRef,
    setSelectedObjectIds: state.setSelectedObjectIds,
    setObjects: state.setObjects,
    setPresenceUsers: state.setPresenceUsers,
    setBoardError: state.setBoardError,
    lastCursorWriteRef: refs.lastCursorWriteRef,
    idTokenRef: refs.idTokenRef,
  });

  return {
    clearStickyTextHoldDrag,
  };
}
