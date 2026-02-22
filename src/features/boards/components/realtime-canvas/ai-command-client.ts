import { getBoardCommandErrorMessage } from "@/features/ai/board-command";
import type {
  BoardCommandResponse,
  BoardSelectionUpdate,
  ViewportBounds,
} from "@/features/ai/types";

export type SendBoardAiCommandInput = {
  boardId: string;
  message: string;
  idToken: string;
  selectedObjectIds: string[];
  viewportBounds?: ViewportBounds;
};

export type SendBoardAiCommandResult = {
  assistantMessage: string;
  selectionUpdate?: BoardSelectionUpdate;
};

/**
 * Sends board AI command request and returns normalized response payload.
 */
export async function sendBoardAiCommand(
  input: SendBoardAiCommandInput,
): Promise<SendBoardAiCommandResult> {
  try {
    const response = await fetch("/api/ai/board-command", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        boardId: input.boardId,
        message: input.message,
        selectedObjectIds: input.selectedObjectIds,
        ...(input.viewportBounds ? { viewportBounds: input.viewportBounds } : {}),
      }),
    });

    if (!response.ok) {
      let apiErrorMessage: string | undefined;
      try {
        const payload = (await response.json()) as { error?: unknown };
        if (
          typeof payload.error === "string" &&
          payload.error.trim().length > 0
        ) {
          apiErrorMessage = payload.error;
        }
      } catch {
        apiErrorMessage = undefined;
      }

      const assistantMessage = getBoardCommandErrorMessage({
        status: response.status,
      });
      return {
        assistantMessage:
          response.status === 504
            ? assistantMessage
            : apiErrorMessage ?? assistantMessage,
      };
    }

    const payload = (await response.json()) as Partial<BoardCommandResponse>;
    return {
      assistantMessage:
        typeof payload.assistantMessage === "string" &&
        payload.assistantMessage.trim().length > 0
          ? payload.assistantMessage
          : "AI agent coming soon!",
      selectionUpdate: payload.selectionUpdate,
    };
  } catch {
    return {
      assistantMessage: getBoardCommandErrorMessage({
        status: null,
      }),
    };
  }
}
