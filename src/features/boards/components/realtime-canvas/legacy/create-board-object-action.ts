"use client";

import { addDoc, serverTimestamp } from "firebase/firestore";
import type { CollectionReference, DocumentData } from "firebase/firestore";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import {
  getDefaultObjectColor,
  getDefaultObjectSize,
  getMinimumObjectSize,
  isBackgroundContainerType,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  isSnapEligibleObjectType,
  getSpawnOffset,
  snapToGrid,
  toConnectorGeometryFromEndpoints,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  GRID_CONTAINER_DEFAULT_GAP,
  OBJECT_SPAWN_STEP_PX,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  getDefaultSectionTitles,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";
import type { ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject, BoardObjectKind } from "@/features/boards/types";

type CreateBoardObjectActionParams = {
  kind: BoardObjectKind;
  canEdit: boolean;
  userId: string;
  objectsCollectionRef: CollectionReference<DocumentData>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  objectSpawnSequenceRef: MutableRefObject<number>;
  stageRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<ViewportState>;
  snapToGridEnabledRef: RefObject<boolean>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export async function createBoardObjectAction({
  kind,
  canEdit,
  userId,
  objectsCollectionRef,
  objectsByIdRef,
  objectSpawnSequenceRef,
  stageRef,
  viewportRef,
  snapToGridEnabledRef,
  setBoardError,
}: CreateBoardObjectActionParams): Promise<void> {
  if (!canEdit) {
    return;
  }

  const stageElement = stageRef.current;
  if (!stageElement) {
    return;
  }

  const rect = stageElement.getBoundingClientRect();
  const centerX = (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
  const centerY =
    (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
  const defaultSize = getDefaultObjectSize(kind);
  let width = defaultSize.width;
  let height = defaultSize.height;
  if (kind === "gridContainer") {
    const viewableWidth = rect.width / viewportRef.current.scale;
    const viewableHeight = rect.height / viewportRef.current.scale;
    const minimumSize = getMinimumObjectSize(kind);
    width = Math.max(minimumSize.width, Math.round(viewableWidth * 0.9));
    height = Math.max(minimumSize.height, Math.round(viewableHeight * 0.9));
  }
  const spawnIndex = objectsByIdRef.current.size + objectSpawnSequenceRef.current;
  objectSpawnSequenceRef.current += 1;
  const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
  const startXRaw = centerX - width / 2 + spawnOffset.x;
  const startYRaw = centerY - height / 2 + spawnOffset.y;
  const startX =
    snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
      ? snapToGrid(startXRaw)
      : startXRaw;
  const startY =
    snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
      ? snapToGrid(startYRaw)
      : startYRaw;
  const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
    (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
    0,
  );
  const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
    (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
    0,
  );
  const nextZIndex = isBackgroundContainerType(kind)
    ? lowestZIndex - 1
    : highestZIndex + 1;
  const isConnector = isConnectorKind(kind);

  try {
    const connectorFrom = isConnector
      ? {
          x: startX,
          y: startY + height / 2,
        }
      : null;
    const connectorTo = isConnector
      ? {
          x: startX + width,
          y: startY + height / 2,
        }
      : null;
    const connectorGeometry =
      connectorFrom && connectorTo
        ? toConnectorGeometryFromEndpoints(connectorFrom, connectorTo)
        : null;

    const payload: Record<string, unknown> = {
      type: kind,
      zIndex: nextZIndex,
      x: connectorGeometry ? connectorGeometry.x : startX,
      y: connectorGeometry ? connectorGeometry.y : startY,
      width: connectorGeometry ? connectorGeometry.width : width,
      height: connectorGeometry ? connectorGeometry.height : height,
      rotationDeg: 0,
      color: getDefaultObjectColor(kind),
      text: kind === "sticky" ? "New sticky note" : kind === "text" ? "Text" : "",
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (kind === "gridContainer") {
      const defaultSectionTitles = getDefaultSectionTitles(1, 1);
      payload.gridRows = 1;
      payload.gridCols = 1;
      payload.gridGap = GRID_CONTAINER_DEFAULT_GAP;
      payload.gridCellColors = ["transparent"];
      payload.containerTitle = "";
      payload.gridSectionTitles = defaultSectionTitles;
      payload.gridSectionNotes = Array.from(
        { length: defaultSectionTitles.length },
        () => "",
      );
    }

    if (connectorFrom && connectorTo) {
      payload.fromObjectId = null;
      payload.toObjectId = null;
      payload.fromAnchor = null;
      payload.toAnchor = null;
      payload.fromX = connectorFrom.x;
      payload.fromY = connectorFrom.y;
      payload.toX = connectorTo.x;
      payload.toY = connectorTo.y;
    }

    await addDoc(objectsCollectionRef, payload);
  } catch (error) {
    console.error("Failed to create object", error);
    setBoardError(toBoardErrorMessage(error, "Failed to create object."));
  }
}
