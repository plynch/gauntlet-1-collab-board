/* eslint-disable react-hooks/refs */

import { useMemo, type MutableRefObject } from "react";
import type { Dispatch, SetStateAction } from "react";

import type {
  BoardObject,
  PresenceUser,
  ConnectorAnchor,
} from "@/features/boards/types";
import type {
  ConnectorDraft,
  ConnectorEndpointDragState,
  ObjectGeometry,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  getActivePresenceUsers,
  getPresenceLabel,
  getRemoteCursors,
} from "@/features/boards/components/realtime-canvas/use-presence-sync";
import { PRESENCE_TTL_MS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { useSelectionUiState } from "@/features/boards/components/realtime-canvas/legacy/use-selection-ui-state";

type UseCanvasSelectionViewStateArgs = {
  canEdit: boolean;
  objects: BoardObject[];
  draftGeometryById: Record<string, ObjectGeometry>;
  draftConnectorById: Record<string, ConnectorDraft>;
  selectedObjectIds: string[];
  stageSize: { width: number; height: number };
  viewport: ViewportState;
  connectorEndpointDragStateRef: MutableRefObject<ConnectorEndpointDragState | null>;
  getConnectableAnchorPoints: () => Array<{
    objectId: string;
    anchor: ConnectorAnchor;
    x: number;
    y: number;
  }>;
  selectionLabelDraft: string;
  setSelectionLabelDraft: Dispatch<SetStateAction<string>>;
  persistObjectLabelText: (objectId: string, nextText: string) => Promise<void>;
  selectionHudSize: { width: number; height: number };
  selectionHudRef: MutableRefObject<HTMLDivElement | null>;
  setSelectionHudSize: Dispatch<
    SetStateAction<{ width: number; height: number }>
  >;
  presenceUsers: PresenceUser[];
  presenceClock: number;
  userId: string;
  objectLabelMaxLength: number;
};

export function useCanvasSelectionViewState({
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
  userId,
  objectLabelMaxLength,
}: UseCanvasSelectionViewStateArgs) {
  const onlineUsers = useMemo(
    () =>
      getActivePresenceUsers(
        presenceUsers,
        presenceClock,
        PRESENCE_TTL_MS,
      ).sort((left, right) =>
        getPresenceLabel(left).localeCompare(getPresenceLabel(right)),
      ),
    [presenceClock, presenceUsers],
  );

  const remoteCursors = useMemo(
    () => getRemoteCursors(onlineUsers, userId),
    [onlineUsers, userId],
  );

  const activeEndpointDrag = connectorEndpointDragStateRef.current;
  const isConnectorEndpointDragging = activeEndpointDrag !== null;

  const selectionUiState = useSelectionUiState({
    canEdit,
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    stageSize,
    viewport,
    activeEndpointDrag,
    isConnectorEndpointDragging,
    getConnectableAnchorPoints,
    selectionLabelDraft,
    setSelectionLabelDraft,
    persistObjectLabelText,
    objectLabelMaxLength,
    selectionHudSize,
    selectionHudRef,
    setSelectionHudSize,
  });

  const connectorEndpointDragObjectId = activeEndpointDrag?.objectId ?? null;

  return {
    onlineUsers,
    remoteCursors,
    connectorEndpointDragObjectId,
    ...selectionUiState,
  };
}
