"use client";

import {
  useCallback,
} from "react";
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { doc, serverTimestamp, type Firestore, updateDoc } from "firebase/firestore";

import { isLabelEditableObjectType } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import type { BoardObject } from "@/features/boards/types";

type SubmitAiCommandMessage = (message: string, options: {
  appendUserMessage: boolean;
  clearInput: boolean;
}) => void;

type UseBoardAssistantActionsParams = {
  canEdit: boolean;
  isAiSubmitting: boolean;
  isSwotTemplateCreating: boolean;
  setIsAiSubmitting: Dispatch<SetStateAction<boolean>>;
  setIsSwotTemplateCreating: Dispatch<SetStateAction<boolean>>;
  createSwotTemplate: () => Promise<string | null>;
  appendAssistantMessage: (message: string) => void;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  resetHistoryNavigation: () => void;
  submitAiCommandMessage: SubmitAiCommandMessage;
  handleChatInputKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    isSubmitting: boolean,
  ) => void;
  chatInput: string;
  boardId: string;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  db: Firestore;
  setObjects: Dispatch<SetStateAction<BoardObject[]>>;
  setBoardError: (message: string) => void;
};

type UseBoardAssistantActionsResult = {
  handleAiChatSubmit: (event: ReactFormEvent<HTMLFormElement>) => void;
  handleAiChatInputKeyDown: (
    event: ReactKeyboardEvent<HTMLInputElement>,
  ) => void;
  persistObjectLabelText: (objectId: string, nextText: string) => Promise<void>;
  handleCreateSwotButtonClick: () => void;
};

export function useBoardAssistantActions({
  canEdit,
  isAiSubmitting,
  isSwotTemplateCreating,
  setIsAiSubmitting,
  setIsSwotTemplateCreating,
  createSwotTemplate,
  appendAssistantMessage,
  setSelectedObjectIds,
  resetHistoryNavigation,
  submitAiCommandMessage,
  handleChatInputKeyDown,
  chatInput,
  boardId,
  objectsByIdRef,
  db,
  setObjects,
  setBoardError,
}: UseBoardAssistantActionsParams): UseBoardAssistantActionsResult {
  const handleAiChatSubmit = useCallback(
    (event: ReactFormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextMessage = chatInput.trim();
      if (nextMessage.length === 0 || isAiSubmitting) {
        return;
      }

      void submitAiCommandMessage(nextMessage, {
        appendUserMessage: true,
        clearInput: true,
      });
    },
    [chatInput, isAiSubmitting, submitAiCommandMessage],
  );

  const handleAiChatInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      handleChatInputKeyDown(event, isAiSubmitting);
    },
    [handleChatInputKeyDown, isAiSubmitting],
  );

  const persistObjectLabelText = useCallback(
    async (objectId: string, nextText: string) => {
      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isLabelEditableObjectType(objectItem.type)) {
        return;
      }

      const previousText = objectItem.text ?? "";
      if (nextText === previousText) {
        return;
      }

      setObjects((previous) =>
        previous.map((item) =>
          item.id === objectId
            ? {
                ...item,
                text: nextText,
              }
            : item,
        ),
      );

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: nextText,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        setObjects((previous) =>
          previous.map((item) =>
            item.id === objectId
              ? {
                  ...item,
                  text: previousText,
                }
              : item,
          ),
        );
        setBoardError(toBoardErrorMessage(error, "Failed to update label."));
      }
    },
    [boardId, db, objectsByIdRef, setBoardError, setObjects],
  );

  const handleCreateSwotButtonClick = useCallback(() => {
    if (!canEdit || isAiSubmitting || isSwotTemplateCreating) {
      return;
    }

    void (async () => {
      setIsAiSubmitting(false);
      setIsSwotTemplateCreating(true);

      try {
        const swotObjectId = await createSwotTemplate();

        if (!swotObjectId) {
          return;
        }

        appendAssistantMessage("Created SWOT analysis template.");
        setSelectedObjectIds([swotObjectId]);
      } finally {
        setIsSwotTemplateCreating(false);
        setIsAiSubmitting(false);
        resetHistoryNavigation();
      }
    })();
  }, [
    appendAssistantMessage,
    canEdit,
    createSwotTemplate,
    isAiSubmitting,
    isSwotTemplateCreating,
    resetHistoryNavigation,
    setIsAiSubmitting,
    setIsSwotTemplateCreating,
    setSelectedObjectIds,
  ]);

  return {
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
  };
}
