import {
  type Dispatch,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type SetStateAction,
  useCallback,
} from "react";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import type {
  AiFooterResizeState,
  PanState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useClipboardShortcuts } from "@/features/boards/components/realtime-canvas/legacy/use-clipboard-shortcuts";

type UseBoardSelectionActionsParams = {
  canEdit: boolean;
  objects: BoardObject[];
  selectedObjectIds: string[];
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  copiedObjectsRef: MutableRefObject<BoardObject[]>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  deleteObject: (objectId: string) => Promise<void>;
  createObject: (toolKind: BoardObjectKind) => Promise<void>;
  copySelectedObjects: () => void;
  duplicateSelectedObjects: () => Promise<void>;
  pasteCopiedObjects: () => Promise<void>;
  showBoardStatus: (message: string) => void;
  aiFooterHeight: number;
  isAiFooterCollapsed: boolean;
  aiFooterResizeStateRef: MutableRefObject<AiFooterResizeState | PanState | null>;
  setIsAiFooterResizing: Dispatch<SetStateAction<boolean>>;
};

type UseBoardSelectionActionsResult = {
  handleDeleteButtonClick: () => void;
  handleToolButtonClick: (toolKind: BoardObjectKind) => void;
  handleAiFooterResizeStart: (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
};

export function useBoardSelectionActions({
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
}: UseBoardSelectionActionsParams): UseBoardSelectionActionsResult {
  const handleDeleteSelectedObjects = useCallback(() => {
    if (!canEdit) {
      return;
    }

    if (selectedObjectIds.length === 0) {
      return;
    }

    const objectIdsToDelete = [...selectedObjectIds];
    void Promise.all(objectIdsToDelete.map((objectId) => deleteObject(objectId)));
  }, [canEdit, deleteObject, selectedObjectIds]);

  const handleToolButtonClick = useCallback(
    (toolKind: BoardObjectKind) => {
      void createObject(toolKind);
    },
    [createObject],
  );

  const handleDeleteButtonClick = useCallback(() => {
    handleDeleteSelectedObjects();
  }, [handleDeleteSelectedObjects]);

  const selectAllShapes = useCallback(() => {
    const shapeIds = objects
      .filter(
        (objectItem) =>
          objectItem.type === "rect" ||
          objectItem.type === "circle" ||
          objectItem.type === "triangle" ||
          objectItem.type === "star" ||
          objectItem.type === "line",
      )
      .map((objectItem) => objectItem.id);

    if (shapeIds.length === 0) {
      showBoardStatus("No shapes found to select.");
      return;
    }

    setSelectedObjectIds(shapeIds);
    showBoardStatus(
      `Selected ${shapeIds.length} shape${shapeIds.length === 1 ? "" : "s"}.`,
    );
  }, [objects, showBoardStatus, setSelectedObjectIds]);

  const handleCopyShortcut = useCallback(() => {
    const count = selectedObjectIdsRef.current.size;
    if (count === 0) {
      showBoardStatus("Nothing selected to copy.");
      return;
    }

    copySelectedObjects();
    showBoardStatus(`Copied ${count} object${count === 1 ? "" : "s"}.`);
  }, [copySelectedObjects, showBoardStatus, selectedObjectIdsRef]);

  const handleDuplicateShortcut = useCallback(async () => {
    const count = selectedObjectIdsRef.current.size;
    if (count === 0) {
      showBoardStatus("Nothing selected to duplicate.");
      return;
    }

    await duplicateSelectedObjects();
    showBoardStatus(`Duplicated ${count} object${count === 1 ? "" : "s"}.`);
  }, [duplicateSelectedObjects, showBoardStatus, selectedObjectIdsRef]);

  const handlePasteShortcut = useCallback(async () => {
    const count = copiedObjectsRef.current.length;
    if (count === 0) {
      showBoardStatus("Clipboard is empty.");
      return;
    }

    await pasteCopiedObjects();
    showBoardStatus(`Pasted ${count} object${count === 1 ? "" : "s"}.`);
  }, [copiedObjectsRef, pasteCopiedObjects, showBoardStatus]);

  useClipboardShortcuts({
    selectAllShapes,
    copySelectedObjects: handleCopyShortcut,
    duplicateSelectedObjects: handleDuplicateShortcut,
    pasteCopiedObjects: handlePasteShortcut,
  });

  const handleAiFooterResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isAiFooterCollapsed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      aiFooterResizeStateRef.current = {
        startClientY: event.clientY,
        initialHeight: aiFooterHeight,
      };
      setIsAiFooterResizing(true);
    },
    [
      aiFooterHeight,
      aiFooterResizeStateRef,
      isAiFooterCollapsed,
      setIsAiFooterResizing,
    ],
  );

  return {
    handleDeleteButtonClick,
    handleToolButtonClick,
    handleAiFooterResizeStart,
  };
}
