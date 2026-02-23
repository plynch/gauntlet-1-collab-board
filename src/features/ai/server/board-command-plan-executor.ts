import { FieldValue } from "firebase-admin/firestore";
import { CallbackManager } from "@langchain/core/callbacks/manager";
import type { Serialized } from "@langchain/core/load/serializable";

import { LangChainLangfuseCallbackHandler } from "@/features/ai/observability/langchain-langfuse-handler";
import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import { buildToolCallArgTraceFields } from "@/features/ai/server/board-command-plan-trace";
import { isAiAuditEnabled } from "@/features/ai/server/board-command-runtime-config";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type { BoardToolCall } from "@/features/ai/types";
import { getFirebaseAdminDb } from "@/lib/firebase/admin";

const DIRECT_DELETE_BATCH_CHUNK_SIZE = 400;
const LANGCHAIN_TOOL_PLAN_SERIALIZED: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["collabboard", "ai", "tool-plan"],
};

function toSerializedTool(toolName: BoardToolCall["tool"]): Serialized {
  return {
    lc: 1,
    type: "not_implemented",
    id: ["collabboard", "ai", "tool", toolName],
  };
}

function createsObject(toolCall: BoardToolCall): boolean {
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

export async function executePlanWithTracing(options: {
  executor: BoardToolExecutor;
  trace: AiTraceRun;
  operations: BoardToolCall[];
}): Promise<{
  results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
  createdObjectIds: string[];
}> {
  const results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[] = [];
  const createdObjectIdSet = new Set<string>();
  const callbackManager = new CallbackManager();
  callbackManager.addHandler(new LangChainLangfuseCallbackHandler(options.trace), true);
  const chainRun = await callbackManager.handleChainStart(
    LANGCHAIN_TOOL_PLAN_SERIALIZED,
    { operationCount: options.operations.length },
    undefined,
    "chain",
    ["langchain", "tool-execution"],
    { traceId: options.trace.traceId },
    "tool.execute",
  );

  try {
    const toolManager = chainRun.getChild("tool.execute.call");
    for (let index = 0; index < options.operations.length; index += 1) {
      const operation = options.operations[index];
      const argTraceFields = buildToolCallArgTraceFields(operation);
      const toolRun = await toolManager.handleToolStart(
        toSerializedTool(operation.tool),
        JSON.stringify(operation.args ?? {}),
        undefined,
        undefined,
        ["board-tool-call"],
        {
          operationIndex: index,
          tool: operation.tool,
          argKeysJson: argTraceFields.argKeysJson,
          argsPreviewJson: argTraceFields.argsPreviewJson,
          x: argTraceFields.x,
          y: argTraceFields.y,
          objectIdsCount: argTraceFields.objectIdsCount,
        },
        operation.tool,
      );

      try {
        const result = await options.executor.executeToolCall(operation);
        results.push(result);
        if (result.objectId && createsObject(operation)) {
          createdObjectIdSet.add(result.objectId);
        }
        if (Array.isArray(result.createdObjectIds)) {
          result.createdObjectIds.forEach((createdObjectId) => {
            if (typeof createdObjectId === "string" && createdObjectId.length > 0) {
              createdObjectIdSet.add(createdObjectId);
            }
          });
        }

        await toolRun.handleToolEnd({
          objectId: result.objectId ?? null,
          deletedCount: result.deletedCount ?? 0,
          createdCount: result.createdObjectIds?.length ?? 0,
          tool: operation.tool,
        });
      } catch (error) {
        await toolRun.handleToolError(error);
        throw error;
      }
    }

    await chainRun.handleChainEnd({ toolCalls: results.length });
    return {
      results,
      createdObjectIds: Array.from(createdObjectIdSet),
    };
  } catch (error) {
    await chainRun.handleChainError(error, undefined, undefined, undefined, {
      inputs: {
        completedToolCalls: results.length,
      },
    });
    throw error;
  }
}

export async function listAllBoardObjectIds(boardId: string): Promise<string[]> {
  const snapshot = await getFirebaseAdminDb()
    .collection("boards")
    .doc(boardId)
    .collection("objects")
    .get();
  return snapshot.docs.map((documentSnapshot) => documentSnapshot.id);
}

export async function deleteBoardObjectsById(
  boardId: string,
  objectIds: string[],
): Promise<void> {
  if (objectIds.length === 0) {
    return;
  }

  const objectsCollection = getFirebaseAdminDb()
    .collection("boards")
    .doc(boardId)
    .collection("objects");

  for (
    let index = 0;
    index < objectIds.length;
    index += DIRECT_DELETE_BATCH_CHUNK_SIZE
  ) {
    const chunk = objectIds.slice(index, index + DIRECT_DELETE_BATCH_CHUNK_SIZE);
    const batch = getFirebaseAdminDb().batch();
    chunk.forEach((objectId) => {
      batch.delete(objectsCollection.doc(objectId));
    });
    await batch.commit();
  }
}

export async function writeAiAuditLogIfEnabled(options: {
  boardId: string;
  userId: string;
  message: string;
  traceId: string;
  fallbackUsed: boolean;
  mcpUsed: boolean;
  toolCalls: number;
  objectsCreated: number;
  intent: string;
}): Promise<void> {
  if (!isAiAuditEnabled()) {
    return;
  }
  await getFirebaseAdminDb()
    .collection("boards")
    .doc(options.boardId)
    .collection("aiRuns")
    .add({
      userId: options.userId,
      message: options.message,
      traceId: options.traceId,
      intent: options.intent,
      fallbackUsed: options.fallbackUsed,
      mcpUsed: options.mcpUsed,
      toolCalls: options.toolCalls,
      objectsCreated: options.objectsCreated,
      createdAt: FieldValue.serverTimestamp(),
    });
}
