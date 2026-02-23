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
  options?: {
    kind?: BoardObjectKind;
    width?: number;
    height?: number;
    color?: string;
    text?: string;
    background?: boolean;
    containerTitle?: string;
  };
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
  options,
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
  const objectKind = options?.kind ?? kind;
  const defaultSize = getDefaultObjectSize(objectKind);
  let width = defaultSize.width;
  let height = defaultSize.height;
  if (objectKind === "gridContainer") {
    const viewableWidth = rect.width / viewportRef.current.scale;
    const viewableHeight = rect.height / viewportRef.current.scale;
    const minimumSize = getMinimumObjectSize(objectKind);
    width = Math.max(minimumSize.width, Math.round(viewableWidth * 0.9));
    height = Math.max(minimumSize.height, Math.round(viewableHeight * 0.9));
  }
  if (typeof options?.width === "number" && Number.isFinite(options.width)) {
    width = Math.max(getMinimumObjectSize(objectKind).width, options.width);
  }
  if (typeof options?.height === "number" && Number.isFinite(options.height)) {
    height = Math.max(getMinimumObjectSize(objectKind).height, options.height);
  }
  const spawnIndex = objectsByIdRef.current.size + objectSpawnSequenceRef.current;
  objectSpawnSequenceRef.current += 1;
  const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
  const startXRaw = centerX - width / 2 + spawnOffset.x;
  const startYRaw = centerY - height / 2 + spawnOffset.y;
  const startX =
    snapToGridEnabledRef.current && isSnapEligibleObjectType(objectKind)
      ? snapToGrid(startXRaw)
      : startXRaw;
  const startY =
    snapToGridEnabledRef.current && isSnapEligibleObjectType(objectKind)
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
  const shouldPlaceInBackground =
    options?.background ?? isBackgroundContainerType(objectKind);
  const nextZIndex = shouldPlaceInBackground
    ? lowestZIndex - 1
    : highestZIndex + 1;
  const isConnector = isConnectorKind(objectKind);

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
      type: objectKind,
      zIndex: nextZIndex,
      x: connectorGeometry ? connectorGeometry.x : startX,
      y: connectorGeometry ? connectorGeometry.y : startY,
      width: connectorGeometry ? connectorGeometry.width : width,
      height: connectorGeometry ? connectorGeometry.height : height,
      rotationDeg: 0,
      color: options?.color ?? getDefaultObjectColor(objectKind),
      text:
        options?.text ??
        (objectKind === "sticky" ? "New sticky note" : objectKind === "text" ? "Text" : ""),
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (objectKind === "gridContainer") {
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
    if (
      typeof options?.containerTitle === "string" &&
      options.containerTitle.trim().length > 0
    ) {
      payload.containerTitle = options.containerTitle.trim().slice(0, 120);
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
