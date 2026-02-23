"use client";

import { useCallback, useEffect, useMemo } from "react";
import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

import { isLabelEditableObjectType } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { useBoardSelectionAndConnectors } from "@/features/boards/components/realtime-canvas/legacy/use-board-selection-and-connectors";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { hasMeaningfulRotation } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type {
  ConnectorEndpointDragState,
  ConnectorDraft,
  ObjectGeometry,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useSelectionHudSizeSync } from "@/features/boards/components/realtime-canvas/legacy/use-selection-hud-size-sync";
import { calculateSelectionHudPosition } from "@/features/boards/components/realtime-canvas/selection-hud-layout";
import type { BoardObject } from "@/features/boards/types";

type SelectionHudSize = { width: number; height: number };

type UseSelectionUiStateProps = {
  canEdit: boolean;
  objects: BoardObject[];
  draftGeometryById: Record<string, ObjectGeometry>;
  draftConnectorById: Record<string, ConnectorDraft>;
  selectedObjectIds: string[];
  stageSize: { width: number; height: number };
  viewport: ViewportState;
  activeEndpointDrag: ConnectorEndpointDragState | null;
  isConnectorEndpointDragging: boolean;
  getConnectableAnchorPoints: () => Array<{ objectId: string; anchor: string; x: number; y: number }>;
  selectionLabelDraft: string;
  setSelectionLabelDraft: Dispatch<SetStateAction<string>>;
  persistObjectLabelText: (objectId: string, text: string) => Promise<void>;
  objectLabelMaxLength: number;
  selectionHudSize: SelectionHudSize;
  selectionHudRef: RefObject<HTMLDivElement | null>;
  setSelectionHudSize: Dispatch<SetStateAction<SelectionHudSize>>;
};

export function useSelectionUiState({
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
}: UseSelectionUiStateProps) {
  const selectedObjectCount = selectedObjectIds.length;
  const {
    connectorRoutesById,
    selectedObjects,
    selectedObjectBounds,
    selectedConnectorMidpoint,
    selectedColorableObjects,
    selectedColor,
  } = useBoardSelectionAndConnectors({
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    stageSize,
    viewport,
    activeEndpointDrag,
  });

  const canColorSelection = canEdit && selectedColorableObjects.length > 0;
  const canResetSelectionRotation =
    canEdit &&
    selectedObjects.some((selectedObject) =>
      hasMeaningfulRotation(selectedObject.geometry.rotationDeg),
    );
  const singleSelectedObject =
    selectedObjects.length === 1 ? (selectedObjects[0]?.object ?? null) : null;
  const canEditSelectedLabel =
    canEdit &&
    singleSelectedObject !== null &&
    isLabelEditableObjectType(singleSelectedObject.type);
  const canShowSelectionHud = canColorSelection || canEditSelectedLabel;

  const commitSelectionLabelDraft = useCallback(async () => {
    if (!canEditSelectedLabel || !singleSelectedObject) {
      return;
    }

    const trimmed = selectionLabelDraft.trim();
    const nextText =
      trimmed.length === 0 ? "" : trimmed.slice(0, objectLabelMaxLength);
    setSelectionLabelDraft(nextText);
    await persistObjectLabelText(singleSelectedObject.id, nextText);
  }, [
    canEditSelectedLabel,
    objectLabelMaxLength,
    persistObjectLabelText,
    selectionLabelDraft,
    setSelectionLabelDraft,
    singleSelectedObject,
  ]);

  const preferSidePlacement =
    singleSelectedObject !== null &&
    singleSelectedObject.type !== "line" &&
    !isConnectorKind(singleSelectedObject.type);

  const selectionHudPosition = useMemo(
    () =>
      calculateSelectionHudPosition({
        canShowHud: canShowSelectionHud,
        selectedObjectBounds,
        stageSize,
        viewport,
        selectionHudSize,
        selectedConnectorMidpoint,
        preferSidePlacement,
      }),
    [
      canShowSelectionHud,
      preferSidePlacement,
      selectedConnectorMidpoint,
      selectedObjectBounds,
      selectionHudSize,
      stageSize,
      viewport,
    ],
  );

  useEffect(() => {
    if (!canEditSelectedLabel || !singleSelectedObject) {
      setSelectionLabelDraft("");
      return;
    }
    setSelectionLabelDraft(singleSelectedObject.text ?? "");
  }, [canEditSelectedLabel, setSelectionLabelDraft, singleSelectedObject]);

  const hasDeletableSelection = useMemo(
    () =>
      canEdit &&
      selectedObjectIds.length > 0 &&
      objects.some((item) => selectedObjectIds.includes(item.id)),
    [canEdit, objects, selectedObjectIds],
  );

  const hasSelectedConnector = useMemo(
    () =>
      selectedObjectIds.some((objectId) => {
        const item = objects.find((candidate) => candidate.id === objectId);
        return item ? isConnectorKind(item.type) : false;
      }),
    [objects, selectedObjectIds],
  );

  const shouldShowConnectorAnchors =
    canEdit && (hasSelectedConnector || isConnectorEndpointDragging);
  const connectorAnchorPoints = shouldShowConnectorAnchors
    ? getConnectableAnchorPoints()
    : [];

  useSelectionHudSizeSync({
    canShowSelectionHud,
    selectionHudRef,
    setSelectionHudSize,
  });

  return {
    selectedObjectCount,
    connectorRoutesById,
    selectedObjects,
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
  };
}
