import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import type {
  BoardCommandRequest,
  BoardCommandResponse
} from "@/features/ai/types";

export const MAX_BOARD_COMMAND_CHARS = 500;
export const MAX_BOARD_COMMAND_SELECTION_IDS = 100;
export const AI_COMMAND_REQUEST_TIMEOUT_MS = 8_000;

export function parseBoardCommandRequest(input: unknown): BoardCommandRequest | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    boardId?: unknown;
    message?: unknown;
    selectedObjectIds?: unknown;
  };

  if (typeof candidate.boardId !== "string" || candidate.boardId.trim().length === 0) {
    return null;
  }

  if (typeof candidate.message !== "string") {
    return null;
  }

  const message = candidate.message.trim();
  if (message.length === 0 || message.length > MAX_BOARD_COMMAND_CHARS) {
    return null;
  }

  let selectedObjectIds: string[] | undefined;
  if (candidate.selectedObjectIds !== undefined) {
    if (!Array.isArray(candidate.selectedObjectIds)) {
      return null;
    }

    const normalized = candidate.selectedObjectIds
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    if (normalized.length > MAX_BOARD_COMMAND_SELECTION_IDS) {
      return null;
    }

    selectedObjectIds = normalized;
  }

  return {
    boardId: candidate.boardId.trim(),
    message,
    selectedObjectIds
  };
}

export function buildStubBoardCommandResponse(options: {
  message: string;
  canEdit: boolean;
}): BoardCommandResponse {
  const responseText = options.canEdit
    ? `AI agent coming soon! I parsed your request: "${options.message}".`
    : "AI agent coming soon! You currently have read-only access on this board.";

  return {
    ok: true,
    provider: "stub",
    assistantMessage: responseText,
    tools: BOARD_AI_TOOLS
  };
}

export function getBoardCommandErrorMessage(options: {
  status: number | null;
  timedOut?: boolean;
}): string {
  if (options.timedOut) {
    return "AI assistant request timed out. Please try again.";
  }

  if (options.status === 401) {
    return "Your session expired. Please sign in again to use the AI assistant.";
  }

  if (options.status === 403) {
    return "You do not have access to run AI commands on this board.";
  }

  if (options.status === 404) {
    return "This board could not be found. Refresh and try again.";
  }

  if (options.status !== null && options.status >= 500) {
    return "AI backend is temporarily unavailable. Please try again shortly.";
  }

  return "AI backend is temporarily unavailable. Please try again shortly.";
}
