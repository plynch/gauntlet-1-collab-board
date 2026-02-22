import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";
import {
  doc,
  serverTimestamp,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";

import type { BoardObject } from "@/features/boards/types";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import { isBackgroundContainerType } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { DUPLICATE_OFFSET_PX } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  cloneBoardObjectForClipboard,
  isSnapEligibleObjectType,
  snapToGrid,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";

type UseObjectTemplateActionsOptions = {
  canEdit: boolean;
  db: Firestore;
  objectsCollectionRef: CollectionReference<DocumentData>;
  userId: string;
  selectedObjectIds: string[];
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  copiedObjectsRef: MutableRefObject<BoardObject[]>;
  copyPasteSequenceRef: MutableRefObject<number>;
  snapToGridEnabledRef: MutableRefObject<boolean>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  setBoardError: Dispatch<SetStateAction<string | null>>;
};

type CreateTemplateOptions = {
  offsetX: number;
  offsetY: number;
};

export function useObjectTemplateActions({
  canEdit,
  db,
  objectsCollectionRef,
  userId,
  selectedObjectIds,
  objectsByIdRef,
  copiedObjectsRef,
  copyPasteSequenceRef,
  snapToGridEnabledRef,
  setSelectedObjectIds,
  setBoardError,
}: UseObjectTemplateActionsOptions) {
  const createObjectsFromTemplates = useCallback(
    async (templates: BoardObject[], createOptions: CreateTemplateOptions) => {
      if (!canEdit || templates.length === 0) {
        return [];
      }

      const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
        0,
      );
      const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
        0,
      );
      const sortedTemplates = [...templates].sort(
        (left, right) => left.zIndex - right.zIndex,
      );
      const templateRefs = sortedTemplates.map((template) => ({
        template,
        docRef: doc(objectsCollectionRef),
      }));
      const idMap = new Map<string, string>();
      templateRefs.forEach(({ template, docRef }) => {
        idMap.set(template.id, docRef.id);
      });

      let nextForegroundZIndex = highestZIndex + 1;
      let nextBackgroundZIndex = lowestZIndex - 1;
      const batch = writeBatch(db);

      templateRefs.forEach(({ template, docRef }) => {
        const isBackground = isBackgroundContainerType(template.type);
        const nextZIndex = isBackground
          ? nextBackgroundZIndex--
          : nextForegroundZIndex++;
        const nextXRaw = template.x + createOptions.offsetX;
        const nextYRaw = template.y + createOptions.offsetY;
        const nextX =
          snapToGridEnabledRef.current && isSnapEligibleObjectType(template.type)
            ? snapToGrid(nextXRaw)
            : nextXRaw;
        const nextY =
          snapToGridEnabledRef.current && isSnapEligibleObjectType(template.type)
            ? snapToGrid(nextYRaw)
            : nextYRaw;
        const mappedContainerId =
          template.containerId && idMap.has(template.containerId)
            ? (idMap.get(template.containerId) ?? null)
            : null;
        const mappedFromObjectId =
          template.fromObjectId && idMap.has(template.fromObjectId)
            ? (idMap.get(template.fromObjectId) ?? null)
            : null;
        const mappedToObjectId =
          template.toObjectId && idMap.has(template.toObjectId)
            ? (idMap.get(template.toObjectId) ?? null)
            : null;

        const payload: Record<string, unknown> = {
          type: template.type,
          zIndex: nextZIndex,
          x: nextX,
          y: nextY,
          width: template.width,
          height: template.height,
          rotationDeg: template.rotationDeg,
          color: template.color,
          text: template.text,
          createdBy: userId,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          fromObjectId: mappedFromObjectId,
          toObjectId: mappedToObjectId,
          fromAnchor: mappedFromObjectId ? template.fromAnchor ?? null : null,
          toAnchor: mappedToObjectId ? template.toAnchor ?? null : null,
          fromX:
            template.fromX === null || template.fromX === undefined
              ? null
              : template.fromX + createOptions.offsetX,
          fromY:
            template.fromY === null || template.fromY === undefined
              ? null
              : template.fromY + createOptions.offsetY,
          toX:
            template.toX === null || template.toX === undefined
              ? null
              : template.toX + createOptions.offsetX,
          toY:
            template.toY === null || template.toY === undefined
              ? null
              : template.toY + createOptions.offsetY,
          gridRows: template.gridRows ?? null,
          gridCols: template.gridCols ?? null,
          gridGap: template.gridGap ?? null,
          gridCellColors: template.gridCellColors ?? null,
          containerTitle: template.containerTitle ?? null,
          gridSectionTitles: template.gridSectionTitles ?? null,
          gridSectionNotes: template.gridSectionNotes ?? null,
          containerId: mappedContainerId,
          containerSectionIndex:
            mappedContainerId !== null
              ? (template.containerSectionIndex ?? null)
              : null,
          containerRelX:
            mappedContainerId !== null ? (template.containerRelX ?? null) : null,
          containerRelY:
            mappedContainerId !== null ? (template.containerRelY ?? null) : null,
        };

        batch.set(docRef, payload);
      });

      await batch.commit();

      const createdIds = templateRefs.map(({ docRef }) => docRef.id);
      setSelectedObjectIds(createdIds);
      return createdIds;
    },
    [
      canEdit,
      db,
      objectsByIdRef,
      objectsCollectionRef,
      setSelectedObjectIds,
      snapToGridEnabledRef,
      userId,
    ],
  );

  const copySelectedObjects = useCallback(() => {
    const selectedTemplates = selectedObjectIds
      .map((objectId) => objectsByIdRef.current.get(objectId))
      .filter((objectItem): objectItem is BoardObject => Boolean(objectItem))
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((objectItem) => cloneBoardObjectForClipboard(objectItem));

    copiedObjectsRef.current = selectedTemplates;
    copyPasteSequenceRef.current = 0;
  }, [copiedObjectsRef, copyPasteSequenceRef, objectsByIdRef, selectedObjectIds]);

  const duplicateSelectedObjects = useCallback(async () => {
    if (!canEdit) {
      return;
    }

    const selectedTemplates = selectedObjectIds
      .map((objectId) => objectsByIdRef.current.get(objectId))
      .filter((objectItem): objectItem is BoardObject => Boolean(objectItem))
      .sort((left, right) => left.zIndex - right.zIndex)
      .map((objectItem) => cloneBoardObjectForClipboard(objectItem));
    if (selectedTemplates.length === 0) {
      return;
    }

    copiedObjectsRef.current = selectedTemplates;
    copyPasteSequenceRef.current = 1;
    try {
      await createObjectsFromTemplates(selectedTemplates, {
        offsetX: DUPLICATE_OFFSET_PX,
        offsetY: DUPLICATE_OFFSET_PX,
      });
    } catch (error) {
      console.error("Failed to duplicate selected objects", error);
      setBoardError(
        toBoardErrorMessage(error, "Failed to duplicate selected objects."),
      );
    }
  }, [
    canEdit,
    copiedObjectsRef,
    copyPasteSequenceRef,
    createObjectsFromTemplates,
    objectsByIdRef,
    selectedObjectIds,
    setBoardError,
  ]);

  const pasteCopiedObjects = useCallback(async () => {
    if (!canEdit || copiedObjectsRef.current.length === 0) {
      return;
    }

    copyPasteSequenceRef.current += 1;
    const offset = DUPLICATE_OFFSET_PX * copyPasteSequenceRef.current;
    try {
      await createObjectsFromTemplates(copiedObjectsRef.current, {
        offsetX: offset,
        offsetY: offset,
      });
    } catch (error) {
      console.error("Failed to paste copied objects", error);
      setBoardError(toBoardErrorMessage(error, "Failed to paste copied objects."));
    }
  }, [
    canEdit,
    copiedObjectsRef,
    copyPasteSequenceRef,
    createObjectsFromTemplates,
    setBoardError,
  ]);

  return {
    createObjectsFromTemplates,
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
  };
}
