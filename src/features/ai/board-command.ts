import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import type {
  BoardCommandRequest,
  BoardCommandResponse,
  BoardCommandExecutionSummary,
} from "@/features/ai/types";

export const MAX_BOARD_COMMAND_CHARS = 500;
export const MAX_BOARD_COMMAND_SELECTION_IDS = 100;
export const AI_COMMAND_REQUEST_TIMEOUT_MS = 8_000;
export const MCP_TEMPLATE_TIMEOUT_MS = 1_200;

export type BoardCommandIntent = "swot-template" | "stub";

/**
 * Parses viewport bounds payload.
 */
function parseViewportBounds(input: unknown):
  | {
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    left?: unknown;
    top?: unknown;
    width?: unknown;
    height?: unknown;
  };

  if (
    typeof candidate.left !== "number" ||
    !Number.isFinite(candidate.left) ||
    typeof candidate.top !== "number" ||
    !Number.isFinite(candidate.top) ||
    typeof candidate.width !== "number" ||
    !Number.isFinite(candidate.width) ||
    typeof candidate.height !== "number" ||
    !Number.isFinite(candidate.height)
  ) {
    return null;
  }

  if (candidate.width <= 0 || candidate.height <= 0) {
    return null;
  }

  return {
    left: candidate.left,
    top: candidate.top,
    width: candidate.width,
    height: candidate.height,
  };
}

/**
 * Parses board command request.
 */
export function parseBoardCommandRequest(
  input: unknown,
): BoardCommandRequest | null {
  if (!input || typeof input !== "object") {
    return null;
  }

  const candidate = input as {
    boardId?: unknown;
    message?: unknown;
    selectedObjectIds?: unknown;
    viewportBounds?: unknown;
  };

  if (
    typeof candidate.boardId !== "string" ||
    candidate.boardId.trim().length === 0
  ) {
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

  let viewportBounds:
    | {
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined;
  if (candidate.viewportBounds !== undefined) {
    const parsedViewportBounds = parseViewportBounds(candidate.viewportBounds);
    if (!parsedViewportBounds) {
      return null;
    }
    viewportBounds = parsedViewportBounds;
  }

  return {
    boardId: candidate.boardId.trim(),
    message,
    selectedObjectIds,
    viewportBounds,
  };
}

/**
 * Builds stub board command response.
 */
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
    tools: BOARD_AI_TOOLS,
    mode: "stub",
    execution: {
      intent: "stub",
      mode: "stub",
      mcpUsed: false,
      fallbackUsed: false,
      toolCalls: 0,
      objectsCreated: 0,
    },
  };
}

/**
 * Handles detect board command intent.
 */
export function detectBoardCommandIntent(message: string): BoardCommandIntent {
  const normalized = message.trim().toLowerCase();
  const swotMatches =
    normalized.includes("swot") &&
    (normalized.includes("template") ||
      normalized.includes("analysis") ||
      normalized.includes("board") ||
      normalized.includes("create") ||
      normalized.includes("build"));

  if (swotMatches) {
    return "swot-template";
  }

  return "stub";
}

/**
 * Builds swot assistant message.
 */
export function buildSwotAssistantMessage(options: {
  fallbackUsed: boolean;
  objectsCreated: number;
}): string {
  const suffix = options.fallbackUsed ? " (MCP fallback mode)" : "";
  return `Created SWOT analysis template with 4 labeled quadrants (${options.objectsCreated} objects).${suffix}`;
}

/**
 * Builds clear board assistant message.
 */
export function buildClearBoardAssistantMessage(options: {
  deletedCount: number;
  remainingCount: number;
}): string {
  const deletedCount = Math.max(0, Math.floor(options.deletedCount));
  const remainingCount = Math.max(0, Math.floor(options.remainingCount));

  if (remainingCount === 0) {
    return `Cleared board and deleted ${deletedCount} object${deletedCount === 1 ? "" : "s"}.`;
  }

  if (deletedCount === 0) {
    return `I could not clear the board yet. ${remainingCount} object${remainingCount === 1 ? "" : "s"} still remain.`;
  }

  return `Deleted ${deletedCount} object${deletedCount === 1 ? "" : "s"}, but ${remainingCount} object${remainingCount === 1 ? "" : "s"} still remain. Try clear board again.`;
}

/**
 * Builds deterministic board command response.
 */
export function buildDeterministicBoardCommandResponse(options: {
  assistantMessage: string;
  traceId: string;
  execution: BoardCommandExecutionSummary;
}): BoardCommandResponse {
  return {
    ok: true,
    provider: "deterministic-mcp",
    assistantMessage: options.assistantMessage,
    tools: BOARD_AI_TOOLS,
    mode: "deterministic",
    traceId: options.traceId,
    execution: options.execution,
  };
}

/**
 * Gets board command error message.
 */
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
