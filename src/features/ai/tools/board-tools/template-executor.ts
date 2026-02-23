import type { BoardToolCall, TemplatePlan } from "@/features/ai/types";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

type ToolExecutor = {
  executeToolCall: (toolCall: BoardToolCall) => Promise<ExecuteToolResultLike>;
};

export async function executeTemplatePlanWithExecutor(
  executor: ToolExecutor,
  plan: TemplatePlan,
): Promise<{
  results: ExecuteToolResultLike[];
  createdObjectIds: string[];
}> {
  const results: ExecuteToolResultLike[] = [];
  const createdObjectIds: string[] = [];
  for (const operation of plan.operations) {
    const result = await executor.executeToolCall(operation);
    results.push(result);
    if (
      result.objectId &&
      (operation.tool === "createStickyNote" ||
        operation.tool === "createShape" ||
        operation.tool === "createGridContainer" ||
        operation.tool === "createFrame" ||
        operation.tool === "createConnector")
    ) {
      createdObjectIds.push(result.objectId);
    }
    if (
      (operation.tool === "createStickyBatch" ||
        operation.tool === "createShapeBatch") &&
      result.createdObjectIds &&
      result.createdObjectIds.length > 0
    ) {
      createdObjectIds.push(...result.createdObjectIds);
    }
  }
  return { results, createdObjectIds };
}
