import type { BoardToolCall, TemplatePlan } from "@/features/ai/types";

export const MAX_AI_OPERATIONS_PER_COMMAND = 20;
export const MAX_AI_CREATED_OBJECTS_PER_COMMAND = 12;
export const MAX_AI_COMMANDS_PER_USER_PER_WINDOW = 20;
export const AI_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1_000;
export const AI_BOARD_LOCK_TTL_MS = 15_000;
export const AI_ROUTE_TIMEOUT_MS = 12_000;

type RateWindow = {
  timestamps: number[];
};

const userRateWindows = new Map<string, RateWindow>();
const boardLocks = new Map<string, number>();

function isCreateTool(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

export function countCreatedObjects(operations: BoardToolCall[]): number {
  return operations.reduce(
    (total, operation) => total + (isCreateTool(operation) ? 1 : 0),
    0
  );
}

export function validateTemplatePlan(plan: TemplatePlan): {
  ok: true;
  objectsCreated: number;
} | {
  ok: false;
  status: number;
  error: string;
} {
  if (plan.operations.length > MAX_AI_OPERATIONS_PER_COMMAND) {
    return {
      ok: false,
      status: 400,
      error: `Template exceeds max operations (${MAX_AI_OPERATIONS_PER_COMMAND}).`
    };
  }

  const objectsCreated = countCreatedObjects(plan.operations);
  if (objectsCreated > MAX_AI_CREATED_OBJECTS_PER_COMMAND) {
    return {
      ok: false,
      status: 400,
      error: `Template exceeds max created objects (${MAX_AI_CREATED_OBJECTS_PER_COMMAND}).`
    };
  }

  return { ok: true, objectsCreated };
}

export function checkUserRateLimit(userId: string, nowMs = Date.now()): {
  ok: true;
} | {
  ok: false;
  status: number;
  error: string;
} {
  const windowStart = nowMs - AI_RATE_LIMIT_WINDOW_MS;
  const current = userRateWindows.get(userId) ?? { timestamps: [] };
  const nextTimestamps = current.timestamps.filter((timestamp) => timestamp >= windowStart);

  if (nextTimestamps.length >= MAX_AI_COMMANDS_PER_USER_PER_WINDOW) {
    userRateWindows.set(userId, { timestamps: nextTimestamps });
    return {
      ok: false,
      status: 429,
      error: "Too many AI commands. Please wait a minute and retry."
    };
  }

  nextTimestamps.push(nowMs);
  userRateWindows.set(userId, { timestamps: nextTimestamps });
  return { ok: true };
}

export function acquireBoardCommandLock(boardId: string, nowMs = Date.now()): {
  ok: true;
} | {
  ok: false;
  status: number;
  error: string;
} {
  const existingExpiresAt = boardLocks.get(boardId) ?? 0;
  if (existingExpiresAt > nowMs) {
    return {
      ok: false,
      status: 409,
      error: "Another AI command is already running on this board."
    };
  }

  boardLocks.set(boardId, nowMs + AI_BOARD_LOCK_TTL_MS);
  return { ok: true };
}

export function releaseBoardCommandLock(boardId: string): void {
  boardLocks.delete(boardId);
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  let timeoutId: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
