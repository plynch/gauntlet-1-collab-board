import type { TemplatePlan, BoardToolCall } from "@/features/ai/types";
import type { BoardToolExecutor } from "@/features/ai/tools/board-tools";

const OPENAI_TRACE_OPERATIONS_PREVIEW_LIMIT = 3;
const OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS = 1_200;

export function buildOpenAiPlanTraceFields(
  plan: TemplatePlan | null | undefined,
): {
  operationCount: number;
  operationsPreviewJson: string;
  firstOperationTool: string | null;
  firstOperationX: number | null;
  firstOperationY: number | null;
} {
  const operations = plan?.operations ?? [];
  const operationsPreview = operations
    .slice(0, OPENAI_TRACE_OPERATIONS_PREVIEW_LIMIT)
    .map((operation) => ({
      tool: operation.tool,
      args: operation.args ?? {},
    }));

  const previewJson = JSON.stringify(operationsPreview);
  const operationsPreviewJson =
    previewJson.length <= OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS
      ? previewJson
      : `${previewJson.slice(0, OPENAI_TRACE_OPERATIONS_PREVIEW_MAX_CHARS)}…`;

  const firstOperation = operationsPreview[0];
  const firstArgs =
    firstOperation && firstOperation.args && typeof firstOperation.args === "object"
      ? (firstOperation.args as Record<string, unknown>)
      : null;
  const firstOperationX =
    firstArgs && typeof firstArgs.x === "number" ? firstArgs.x : null;
  const firstOperationY =
    firstArgs && typeof firstArgs.y === "number" ? firstArgs.y : null;

  return {
    operationCount: operations.length,
    operationsPreviewJson,
    firstOperationTool: firstOperation?.tool ?? null,
    firstOperationX,
    firstOperationY,
  };
}

export function buildOperationCountsByTool(
  plan: TemplatePlan | null | undefined,
): string {
  const counts = new Map<string, number>();
  (plan?.operations ?? []).forEach((operation) => {
    counts.set(operation.tool, (counts.get(operation.tool) ?? 0) + 1);
  });
  return JSON.stringify(Object.fromEntries(counts));
}

export function buildToolCallArgTraceFields(toolCall: BoardToolCall): {
  argKeysJson: string;
  argsPreviewJson: string;
  x: number | null;
  y: number | null;
  objectIdsCount: number;
} {
  const argsRecord =
    (toolCall.args as Record<string, unknown> | undefined) ?? {};
  const argsPreviewJson = JSON.stringify(argsRecord).slice(0, 500);
  const xCandidates = [
    argsRecord.x,
    (argsRecord.originX as unknown) ?? null,
    (argsRecord.toPoint as { x?: unknown } | undefined)?.x,
  ];
  const yCandidates = [
    argsRecord.y,
    (argsRecord.originY as unknown) ?? null,
    (argsRecord.toPoint as { y?: unknown } | undefined)?.y,
  ];
  const objectIds = Array.isArray(argsRecord.objectIds)
    ? argsRecord.objectIds
    : [];

  const findFiniteNumber = (values: unknown[]): number | null => {
    const match = values.find(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value),
    );
    return typeof match === "number" ? match : null;
  };

  return {
    argKeysJson: JSON.stringify(Object.keys(argsRecord)),
    argsPreviewJson,
    x: findFiniteNumber(xCandidates),
    y: findFiniteNumber(yCandidates),
    objectIdsCount: objectIds.length,
  };
}

export function buildOutcomeAssistantMessageFromExecution(input: {
  fallbackAssistantMessage: string;
  operations: BoardToolCall[];
  createdObjectIds: string[];
  results: Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>[];
}): string {
  const createdCount = input.createdObjectIds.length;
  const deletedCount = input.results.reduce((total, result) => {
    const count =
      typeof result.deletedCount === "number" && Number.isFinite(result.deletedCount)
        ? Math.max(0, result.deletedCount)
        : 0;
    return total + count;
  }, 0);

  const createdStickyCount = input.operations.reduce((total, operation) => {
    if (operation.tool === "createStickyBatch") {
      return total + Math.max(0, Math.floor(operation.args.count));
    }
    return total + (operation.tool === "createStickyNote" ? 1 : 0);
  }, 0);
  const createdShapeCount = input.operations.reduce((total, operation) => {
    if (operation.tool === "createShapeBatch") {
      return total + Math.max(0, Math.floor(operation.args.count));
    }
    return total + (operation.tool === "createShape" ? 1 : 0);
  }, 0);
  const createToolKinds = new Set(
    input.operations
      .filter((operation) => operation.tool.startsWith("create"))
      .map((operation) => operation.tool),
  );
  const hasMixedCreateTypes = createToolKinds.size > 1;

  if (hasMixedCreateTypes && createdCount > 0) {
    return createdCount === 1
      ? "Created 1 object."
      : `Created ${createdCount} objects.`;
  }
  if (createdStickyCount > 0) {
    return createdCount === 1
      ? "Created 1 sticky note."
      : `Created ${createdCount} sticky notes.`;
  }
  if (createdShapeCount > 0) {
    return createdCount === 1 ? "Created 1 shape." : `Created ${createdCount} shapes.`;
  }

  const hasDeleteOperation = input.operations.some(
    (operation) => operation.tool === "deleteObjects",
  );
  if (hasDeleteOperation) {
    return deletedCount === 1 ? "Deleted 1 object." : `Deleted ${deletedCount} objects.`;
  }

  const distributeOperation = input.operations.find(
    (operation) => operation.tool === "distributeObjects",
  );
  if (distributeOperation?.tool === "distributeObjects") {
    const objectCount = distributeOperation.args.objectIds.length;
    const direction =
      distributeOperation.args.axis === "horizontal"
        ? "left to right"
        : "top to bottom";
    if (distributeOperation.args.viewportBounds) {
      return `Spaced ${objectCount} selected object${objectCount === 1 ? "" : "s"} evenly across the screen ${direction}.`;
    }
    return `Spaced ${objectCount} selected object${objectCount === 1 ? "" : "s"} evenly ${direction}.`;
  }

  const message = input.fallbackAssistantMessage.trim();
  return message.length > 0 ? message : "Completed your board command.";
}
