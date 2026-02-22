import { type Tool } from "@openai/agents";

import { validateTemplatePlan } from "@/features/ai/guardrails";
import { buildCreateTools } from "@/features/ai/openai/agents/board-agent-tools/create-tools";
import { buildEditTools } from "@/features/ai/openai/agents/board-agent-tools/edit-tools";
import { buildLayoutTools } from "@/features/ai/openai/agents/board-agent-tools/layout-tools";
import {
  buildSyntheticPlan,
  createsObjects,
  getDefaultPlacementPoint,
  getMaxAllowedCount,
  hasExplicitCoordinateHints,
  isMutatingToolCall,
  toFiniteNumber,
  type BoardAgentToolFactoryResult,
  type CreateBoardAgentToolsOptions,
  type ExecuteToolResult,
} from "@/features/ai/openai/agents/board-agent-tools/shared";
import type { BoardToolCall } from "@/features/ai/types";

export type { BoardAgentToolExecutionSnapshot } from "@/features/ai/openai/agents/board-agent-tools/shared";

export function createBoardAgentTools(
  options: CreateBoardAgentToolsOptions,
): BoardAgentToolFactoryResult {
  const createdObjectIdSet = new Set<string>();
  const operationsExecuted: BoardToolCall[] = [];
  const results: ExecuteToolResult[] = [];
  let deletedCount = 0;
  let toolCalls = 0;

  const incrementToolCalls = () => {
    toolCalls += 1;
  };

  const executeToolCallWithGuardrails = async (
    toolCall: BoardToolCall,
    traceMetadata?: Record<string, unknown>,
  ): Promise<ExecuteToolResult> => {
    incrementToolCalls();
    const argsRecord = (toolCall.args as Record<string, unknown> | undefined) ?? {};
    const toPoint =
      argsRecord.toPoint &&
      typeof argsRecord.toPoint === "object" &&
      !Array.isArray(argsRecord.toPoint)
        ? (argsRecord.toPoint as { x?: unknown; y?: unknown })
        : undefined;
    const toolSpan = options.trace.startSpan("tool.execute.call", {
      tool: toolCall.tool,
      operationIndex: operationsExecuted.length,
      argKeysJson: JSON.stringify(Object.keys(argsRecord)),
      argsPreviewJson: JSON.stringify(argsRecord).slice(0, 500),
      x: toFiniteNumber(argsRecord.x ?? argsRecord.originX ?? toPoint?.x),
      y: toFiniteNumber(argsRecord.y ?? argsRecord.originY ?? toPoint?.y),
      objectIdsCount: Array.isArray(argsRecord.objectIds)
        ? argsRecord.objectIds.length
        : 0,
      requestedCreateCount: options.messageIntentHints?.requestedCreateCount ?? null,
      maxAllowedCount: getMaxAllowedCount(),
      runtime: "agents-sdk",
      ...(traceMetadata ?? {}),
    });
    try {
      if (
        options.messageIntentHints?.stickyCreateRequest &&
        isMutatingToolCall(toolCall) &&
        toolCall.tool !== "createStickyNote" &&
        toolCall.tool !== "createStickyBatch"
      ) {
        throw new Error(
          "Create-sticky request must use createStickyNote or createStickyBatch.",
        );
      }
      if (isMutatingToolCall(toolCall)) {
        const validation = validateTemplatePlan(
          buildSyntheticPlan([...operationsExecuted, toolCall]),
        );
        if (!validation.ok) {
          throw new Error(validation.error);
        }
      }
      const result = await options.executor.executeToolCall(toolCall);
      results.push(result);
      if (isMutatingToolCall(toolCall)) {
        operationsExecuted.push(toolCall);
      }
      if (result.objectId && createsObjects(toolCall)) {
        createdObjectIdSet.add(result.objectId);
      }
      if (Array.isArray(result.createdObjectIds)) {
        result.createdObjectIds.forEach((objectId) => {
          if (typeof objectId === "string" && objectId.length > 0) {
            createdObjectIdSet.add(objectId);
          }
        });
      }
      if (typeof result.deletedCount === "number" && Number.isFinite(result.deletedCount)) {
        deletedCount += Math.max(0, result.deletedCount);
      }
      toolSpan.end({
        tool: toolCall.tool,
        objectId: result.objectId ?? null,
        createdCount: result.createdObjectIds?.length ?? 0,
        deletedCount: result.deletedCount ?? 0,
      });
      return result;
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Unknown tool execution failure.";
      toolSpan.fail("Tool execution failed.", {
        tool: toolCall.tool,
        reason,
      });
      throw error;
    }
  };

  const defaultPoint = getDefaultPlacementPoint(options.viewportBounds);
  const explicitCoordinateHints = hasExplicitCoordinateHints(options.coordinateHints)
    ? options.coordinateHints
    : null;

  const context = {
    options,
    defaultPoint,
    explicitCoordinateHints,
    executeToolCallWithGuardrails,
    incrementToolCalls,
  };

  const tools: Tool[] = [
    ...buildCreateTools(context),
    ...buildLayoutTools(context),
    ...buildEditTools(context),
  ];

  return {
    tools,
    getExecutionSnapshot: () => ({
      operationsExecuted: [...operationsExecuted],
      results: [...results],
      createdObjectIds: Array.from(createdObjectIdSet),
      deletedCount,
      toolCalls,
    }),
    executeToolCallForTests: executeToolCallWithGuardrails,
  };
}
