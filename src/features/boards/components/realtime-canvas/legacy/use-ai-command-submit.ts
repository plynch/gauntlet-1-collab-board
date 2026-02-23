import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useCallback,
} from "react";
import type { User } from "firebase/auth";

import type { BoardObject } from "@/features/boards/types";
import {
  AI_HELP_MESSAGE,
} from "@/features/boards/components/realtime-canvas/ai-chat-content";
import { sendBoardAiCommand } from "@/features/boards/components/realtime-canvas/ai-command-client";
import type { ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { isLocalAiHelpCommand } from "@/features/boards/components/realtime-canvas/use-ai-chat-state";

type UseAiCommandSubmitArgs = {
  boardId: string;
  user: User;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportState>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  idTokenRef: MutableRefObject<string | null>;
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  isAiSubmitting: boolean;
  setIsAiSubmitting: Dispatch<SetStateAction<boolean>>;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  appendUserMessage: (message: string) => void;
  appendAssistantMessage: (message: string) => void;
  clearChatInputForSubmit: () => void;
};

type SubmitAiCommandOptions = {
  appendUserMessage?: boolean;
  clearInput?: boolean;
};

export function useAiCommandSubmit({
  boardId,
  user,
  stageRef,
  viewportRef,
  objectsByIdRef,
  idTokenRef,
  selectedObjectIdsRef,
  isAiSubmitting,
  setIsAiSubmitting,
  setSelectedObjectIds,
  appendUserMessage,
  appendAssistantMessage,
  clearChatInputForSubmit,
}: UseAiCommandSubmitArgs) {
  return useCallback(
    async (nextMessage: string, options?: SubmitAiCommandOptions) => {
      const shouldAppendUserMessage = options?.appendUserMessage ?? true;
      const shouldClearInput = options?.clearInput ?? false;
      const trimmedMessage = nextMessage.trim();
      if (trimmedMessage.length === 0 || isAiSubmitting) {
        return;
      }

      if (shouldAppendUserMessage) {
        appendUserMessage(nextMessage);
      }
      if (shouldClearInput) {
        clearChatInputForSubmit();
      }

      if (isLocalAiHelpCommand(trimmedMessage)) {
        appendAssistantMessage(AI_HELP_MESSAGE);
        return;
      }

      setIsAiSubmitting(true);

      const applySelectionUpdate = (
        selectionUpdate?: {
          mode: "clear" | "replace";
          objectIds: string[];
        },
      ) => {
        if (!selectionUpdate) {
          return;
        }

        const objectIdsInBoard = new Set(objectsByIdRef.current.keys());
        const normalized = Array.from(
          new Set(
            selectionUpdate.objectIds
              .filter((id) => objectIdsInBoard.has(id))
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        );
        if (selectionUpdate.mode === "clear") {
          setSelectedObjectIds([]);
          return;
        }

        setSelectedObjectIds(normalized);
      };

      try {
        const idToken = idTokenRef.current ?? (await user.getIdToken());
        idTokenRef.current = idToken;
        const stageElement = stageRef.current;
        const viewportBounds = stageElement
          ? {
              left: -viewportRef.current.x / viewportRef.current.scale,
              top: -viewportRef.current.y / viewportRef.current.scale,
              width: stageElement.clientWidth / viewportRef.current.scale,
              height: stageElement.clientHeight / viewportRef.current.scale,
            }
          : undefined;

        const aiResult = await sendBoardAiCommand({
          boardId,
          message: nextMessage,
          idToken,
          selectedObjectIds: Array.from(selectedObjectIdsRef.current),
          viewportBounds,
        });
        applySelectionUpdate(aiResult.selectionUpdate);
        appendAssistantMessage(aiResult.assistantMessage);
      } catch {
        appendAssistantMessage(
          "Your session expired. Please sign in again to use the AI assistant.",
        );
      } finally {
        setIsAiSubmitting(false);
      }
    },
    [
      appendAssistantMessage,
      appendUserMessage,
      boardId,
      clearChatInputForSubmit,
      isAiSubmitting,
      objectsByIdRef,
      selectedObjectIdsRef,
      setIsAiSubmitting,
      setSelectedObjectIds,
      stageRef,
      user,
      viewportRef,
      idTokenRef,
    ],
  );
}
