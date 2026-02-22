import type { BoardToolCall, TemplatePlan } from "@/features/ai/types";
import { createFirestoreGuardrailStore } from "@/features/ai/guardrail-store.firestore";
import type { GuardrailStore } from "@/features/ai/guardrail-store";
import { createMemoryGuardrailStore } from "@/features/ai/guardrail-store.memory";

export const MAX_AI_OPERATIONS_PER_COMMAND = 50;
export const MAX_AI_CREATED_OBJECTS_PER_COMMAND = 50;
export const MAX_AI_STICKY_BATCH_COUNT_PER_TOOL_CALL = 50;
export const MAX_AI_SHAPE_BATCH_COUNT_PER_TOOL_CALL = 50;
export const MAX_AI_DELETIONS_PER_TOOL_CALL = 2_000;
export const MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL = 50;
export const MAX_AI_MOVE_OBJECTS_PER_TOOL_CALL = 500;
export const MAX_AI_COMMANDS_PER_USER_PER_WINDOW = 20;
export const AI_RATE_LIMIT_WINDOW_MS = 5 * 60 * 1_000;
export const AI_BOARD_LOCK_TTL_MS = 15_000;
export const AI_ROUTE_TIMEOUT_MS = 12_000;

let guardrailStore: GuardrailStore | null = null;
type LayoutToolCall = Extract<
  BoardToolCall,
  {
    tool: "arrangeObjectsInGrid" | "alignObjects" | "distributeObjects";
  }
>;

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

export function setGuardrailStoreForTests(store: GuardrailStore | null): void {
  guardrailStore = store;
}

function isCreateTool(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createStickyBatch" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createShapeBatch" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

function isLayoutTool(toolCall: BoardToolCall): toolCall is LayoutToolCall {
  return (
    toolCall.tool === "arrangeObjectsInGrid" ||
    toolCall.tool === "alignObjects" ||
    toolCall.tool === "distributeObjects"
  );
}

export function countCreatedObjects(operations: BoardToolCall[]): number {
  return operations.reduce((total, operation) => {
    if (operation.tool === "createStickyBatch") {
      return total + Math.max(0, Math.floor(operation.args.count));
    }
    if (operation.tool === "createShapeBatch") {
      return total + Math.max(0, Math.floor(operation.args.count));
    }

    return total + (isCreateTool(operation) ? 1 : 0);
  }, 0);
}

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

  const oversizedStickyBatch = plan.operations.find(
    (operation) =>
      operation.tool === "createStickyBatch" &&
      Math.max(0, Math.floor(operation.args.count)) >
        MAX_AI_STICKY_BATCH_COUNT_PER_TOOL_CALL,
  );
  if (oversizedStickyBatch && oversizedStickyBatch.tool === "createStickyBatch") {
    return {
      ok: false,
      status: 400,
      error: `createStickyBatch exceeds max count (${MAX_AI_STICKY_BATCH_COUNT_PER_TOOL_CALL}).`,
    };
  }

  const oversizedShapeBatch = plan.operations.find(
    (operation) =>
      operation.tool === "createShapeBatch" &&
      Math.max(0, Math.floor(operation.args.count)) >
        MAX_AI_SHAPE_BATCH_COUNT_PER_TOOL_CALL,
  );
  if (oversizedShapeBatch && oversizedShapeBatch.tool === "createShapeBatch") {
    return {
      ok: false,
      status: 400,
      error: `createShapeBatch exceeds max count (${MAX_AI_SHAPE_BATCH_COUNT_PER_TOOL_CALL}).`,
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
      isLayoutTool(operation) &&
      operation.args.objectIds.length > MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL,
  );
  if (oversizedLayout && isLayoutTool(oversizedLayout)) {
    return {
      ok: false,
      status: 400,
      error: `${oversizedLayout.tool} exceeds max object ids (${MAX_AI_LAYOUT_OBJECTS_PER_TOOL_CALL}).`,
    };
  }

  const oversizedMove = plan.operations.find(
    (operation) =>
      operation.tool === "moveObjects" &&
      operation.args.objectIds.length > MAX_AI_MOVE_OBJECTS_PER_TOOL_CALL,
  );
  if (oversizedMove && oversizedMove.tool === "moveObjects") {
    return {
      ok: false,
      status: 400,
      error: `moveObjects exceeds max object ids (${MAX_AI_MOVE_OBJECTS_PER_TOOL_CALL}).`,
    };
  }

  return { ok: true, objectsCreated };
}

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

export async function releaseBoardCommandLock(boardId: string): Promise<void> {
  await getGuardrailStore().releaseBoardCommandLock(boardId);
}

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
