import type { BoardToolCall, TemplatePlan } from "@/features/ai/types";
import { createFirestoreGuardrailStore } from "@/features/ai/guardrail-store.firestore";
import type { GuardrailStore } from "@/features/ai/guardrail-store";
import { createMemoryGuardrailStore } from "@/features/ai/guardrail-store.memory";

export const MAX_AI_OPERATIONS_PER_COMMAND = 50;
export const MAX_AI_CREATED_OBJECTS_PER_COMMAND = 50;
export const MAX_AI_DELETIONS_PER_TOOL_CALL = 2_000;
export const MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL = 50;
export const MAX_AI_COMMANDS_PER_USER_PER_WINDOW = 20;
export const AI_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1_000;
export const AI_BOARD_LOCK_TTL_MS = 15_000;
export const AI_ROUTE_TIMEOUT_MS = 12_000;

let guardrailStore: GuardrailStore | null = null;

/**
 * Gets guardrail store.
 */
function getGuardrailStore(): GuardrailStore {
  if (guardrailStore) {
    return guardrailStore;
  }

  guardrailStore =
    process.env.AI_GUARDRAIL_STORE === "firestore"
      ? createFirestoreGuardrailStore()
      : createMemoryGuardrailStore();

  return guardrailStore;
}

/**
 * Sets guardrail store for tests.
 */
export function setGuardrailStoreForTests(store: GuardrailStore | null): void {
  guardrailStore = store;
}

/**
 * Returns whether create tool is true.
 */
function isCreateTool(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

/**
 * Handles count created objects.
 */
export function countCreatedObjects(operations: BoardToolCall[]): number {
  return operations.reduce(
    (total, operation) => total + (isCreateTool(operation) ? 1 : 0),
    0,
  );
}

/**
 * Handles validate template plan.
 */
export function validateTemplatePlan(plan: TemplatePlan):
  | {
      ok: true;
      objectsCreated: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
    } {
  if (plan.operations.length > MAX_AI_OPERATIONS_PER_COMMAND) {
    return {
      ok: false,
      status: 400,
      error: `Template exceeds max operations (${MAX_AI_OPERATIONS_PER_COMMAND}).`,
    };
  }

  const objectsCreated = countCreatedObjects(plan.operations);
  if (objectsCreated > MAX_AI_CREATED_OBJECTS_PER_COMMAND) {
    return {
      ok: false,
      status: 400,
      error: `Template exceeds max created objects (${MAX_AI_CREATED_OBJECTS_PER_COMMAND}).`,
    };
  }

  const oversizedDelete = plan.operations.find(
    (operation) =>
      operation.tool === "deleteObjects" &&
      operation.args.objectIds.length > MAX_AI_DELETIONS_PER_TOOL_CALL,
  );
  if (oversizedDelete && oversizedDelete.tool === "deleteObjects") {
    return {
      ok: false,
      status: 400,
      error: `Delete operation exceeds max object ids (${MAX_AI_DELETIONS_PER_TOOL_CALL}).`,
    };
  }

  const oversizedLayout = plan.operations.find(
    (operation) =>
      operation.tool === "arrangeObjectsInGrid" &&
      operation.args.objectIds.length > MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL,
  );
  if (oversizedLayout && oversizedLayout.tool === "arrangeObjectsInGrid") {
    return {
      ok: false,
      status: 400,
      error: `Grid layout operation exceeds max object ids (${MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL}).`,
    };
  }

  return { ok: true, objectsCreated };
}

/**
 * Handles check user rate limit.
 */
export async function checkUserRateLimit(
  userId: string,
  nowMs = Date.now(),
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  return getGuardrailStore().checkUserRateLimit({
    userId,
    nowMs,
    windowMs: AI_RATE_LIMIT_WINDOW_MS,
    maxCommandsPerWindow: MAX_AI_COMMANDS_PER_USER_PER_WINDOW,
  });
}

/**
 * Handles acquire board command lock.
 */
export async function acquireBoardCommandLock(
  boardId: string,
  nowMs = Date.now(),
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      status: number;
      error: string;
    }
> {
  return getGuardrailStore().acquireBoardCommandLock({
    boardId,
    nowMs,
    ttlMs: AI_BOARD_LOCK_TTL_MS,
  });
}

/**
 * Handles release board command lock.
 */
export async function releaseBoardCommandLock(boardId: string): Promise<void> {
  await getGuardrailStore().releaseBoardCommandLock(boardId);
}

/**
 * Handles with timeout.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
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
