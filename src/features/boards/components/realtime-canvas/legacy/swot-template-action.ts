"use client";

import { addDoc, serverTimestamp } from "firebase/firestore";
import type { CollectionReference, DocumentData } from "firebase/firestore";
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from "react";

import {
  getDefaultObjectColor,
  getDefaultObjectSize,
  getMinimumObjectSize,
  isBackgroundContainerType,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  isSnapEligibleObjectType,
  getSpawnOffset,
  snapToGrid,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  OBJECT_SPAWN_STEP_PX,
  SWOT_SECTION_COLORS,
  SWOT_TEMPLATE_TITLE,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  DEFAULT_SWOT_SECTION_TITLES,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";
import type {
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject } from "@/features/boards/types";

type CreateSwotTemplateActionParams = {
  canEdit: boolean;
  stageRef: RefObject<HTMLDivElement | null>;
  viewportRef: RefObject<ViewportState>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  objectSpawnSequenceRef: MutableRefObject<number>;
  snapToGridEnabledRef: RefObject<boolean>;
  objectsCollectionRef: CollectionReference<DocumentData>;
  userId: string;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

export async function createSwotTemplateAction({
  canEdit,
  stageRef,
  viewportRef,
  objectsByIdRef,
  objectSpawnSequenceRef,
  snapToGridEnabledRef,
  objectsCollectionRef,
  userId,
  setBoardError,
}: CreateSwotTemplateActionParams): Promise<string | null> {
  if (!canEdit) {
    return null;
  }

  const stageElement = stageRef.current;
  if (!stageElement) {
    return null;
  }

  const rect = stageElement.getBoundingClientRect();
  const centerX = (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
  const centerY =
    (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
  const viewableWidth = rect.width / viewportRef.current.scale;
  const viewableHeight = rect.height / viewportRef.current.scale;
  const defaultSize = getDefaultObjectSize("gridContainer");
  const minimumSize = getMinimumObjectSize("gridContainer");
  const width = Math.max(
    minimumSize.width,
    Math.min(2_400, Math.max(defaultSize.width, Math.round(viewableWidth * 0.9))),
  );
  const height = Math.max(
    minimumSize.height,
    Math.min(1_600, Math.max(defaultSize.height, Math.round(viewableHeight * 0.9))),
  );
  const spawnIndex = objectsByIdRef.current.size + objectSpawnSequenceRef.current;
  objectSpawnSequenceRef.current += 1;
  const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
  const startXRaw = centerX - width / 2 + spawnOffset.x;
  const startYRaw = centerY - height / 2 + spawnOffset.y;
  const shouldSnap =
    snapToGridEnabledRef.current && isSnapEligibleObjectType("gridContainer");
  const startX = shouldSnap ? snapToGrid(startXRaw) : startXRaw;
  const startY = shouldSnap ? snapToGrid(startYRaw) : startYRaw;
  const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
    (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
    0,
  );
  const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
    (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
    0,
  );
  const nextZIndex = isBackgroundContainerType("gridContainer")
    ? lowestZIndex - 1
    : highestZIndex + 1;

  try {
    const docRef = await addDoc(objectsCollectionRef, {
      type: "gridContainer",
      zIndex: nextZIndex,
      x: startX,
      y: startY,
      width,
      height,
      rotationDeg: 0,
      color: getDefaultObjectColor("gridContainer"),
      text: "",
      gridRows: 2,
      gridCols: 2,
      gridGap: 2,
      gridCellColors: [...SWOT_SECTION_COLORS],
      containerTitle: SWOT_TEMPLATE_TITLE,
      gridSectionTitles: [...DEFAULT_SWOT_SECTION_TITLES],
      gridSectionNotes: ["", "", "", ""],
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error("Failed to create SWOT template", error);
    setBoardError(toBoardErrorMessage(error, "Failed to create SWOT template."));
    return null;
  }
}
