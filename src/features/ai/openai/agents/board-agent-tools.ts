import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import type { CoordinateHints } from "@/features/ai/commands/coordinate-hints";
import { validateTemplatePlan } from "@/features/ai/guardrails";
import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type {
  BoardToolCall,
  TemplatePlan,
  ViewportBounds,
} from "@/features/ai/types";

const DEFAULT_X = 160;
const DEFAULT_Y = 160;
const DEFAULT_STICKY_COLOR = "#fde68a";
const DEFAULT_SHAPE_COLOR = "#93c5fd";
const DEFAULT_GRID_CONTAINER_WIDTH = 1_200;
const DEFAULT_GRID_CONTAINER_HEIGHT = 700;
const DEFAULT_FRAME_TITLE = "Frame";
const DEFAULT_FRAME_WIDTH = 900;
const DEFAULT_FRAME_HEIGHT = 600;
const DEFAULT_SHAPE_WIDTH = 220;
const DEFAULT_SHAPE_HEIGHT = 160;
const DEFAULT_LINE_WIDTH = 220;
const DEFAULT_LINE_HEIGHT = 24;
const DEFAULT_GRID_COLUMNS = 3;
const DEFAULT_BATCH_COLUMNS = 5;
const DEFAULT_BATCH_GAP_X = 240;
const DEFAULT_BATCH_GAP_Y = 190;

type ExecuteToolResult = Awaited<ReturnType<BoardToolExecutor["executeToolCall"]>>;

export type BoardAgentToolExecutionSnapshot = {
  operationsExecuted: BoardToolCall[];
  results: ExecuteToolResult[];
  createdObjectIds: string[];
  deletedCount: number;
  toolCalls: number;
};

type CreateBoardAgentToolsOptions = {
  executor: BoardToolExecutor;
  trace: AiTraceRun;
  selectedObjectIds: string[];
  viewportBounds: ViewportBounds | null;
  coordinateHints?: CoordinateHints | null;
};

type BoardAgentToolFactoryResult = {
  tools: Tool[];
  getExecutionSnapshot: () => BoardAgentToolExecutionSnapshot;
  executeToolCallForTests: (
    toolCall: BoardToolCall,
  ) => Promise<ExecuteToolResult>;
};

/**
 * Gets tool description by name.
 */
function getToolDescription(
  name: BoardToolCall["tool"],
  fallback: string,
): string {
  const match = BOARD_AI_TOOLS.find((toolItem) => toolItem.name === name);
  return match?.description ?? fallback;
}

/**
 * Returns whether tool call mutates board state.
 */
function isMutatingToolCall(toolCall: BoardToolCall): boolean {
  return toolCall.tool !== "getBoardState";
}

/**
 * Returns whether tool call creates objects.
 */
function createsObjects(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createStickyBatch" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

/**
 * Handles to finite number.
 */
function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Handles to default placement point.
 */
function getDefaultPlacementPoint(
  viewportBounds: ViewportBounds | null,
): { x: number; y: number } {
  if (viewportBounds) {
    return {
      x: viewportBounds.left + Math.max(40, Math.floor(viewportBounds.width * 0.2)),
      y: viewportBounds.top + Math.max(40, Math.floor(viewportBounds.height * 0.2)),
    };
  }

  return {
    x: DEFAULT_X,
    y: DEFAULT_Y,
  };
}

/**
 * Returns whether coordinate hints contain explicit x/y.
 */
function hasExplicitCoordinateHints(
  hints: CoordinateHints | null | undefined,
): hints is { hintedX: number; hintedY: number } {
  return (
    typeof hints?.hintedX === "number" &&
    Number.isFinite(hints.hintedX) &&
    typeof hints?.hintedY === "number" &&
    Number.isFinite(hints.hintedY)
  );
}

/**
 * Handles ensure object ids.
 */
function ensureObjectIds(
  objectIds: string[] | null | undefined,
  selectedObjectIds: string[],
  toolName: string,
): string[] {
  const source = Array.isArray(objectIds) && objectIds.length > 0
    ? objectIds
    : selectedObjectIds;
  const resolved = Array.from(
    new Set(
      source
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );

  if (resolved.length === 0) {
    throw new Error(
      `${toolName} requires object IDs. Select one or more objects and retry.`,
    );
  }

  return resolved;
}

/**
 * Handles build synthetic plan.
 */
function buildSyntheticPlan(operations: BoardToolCall[]): TemplatePlan {
  return {
    templateId: "openai.agents.direct-tools",
    templateName: "OpenAI Agents Direct Tools",
    operations,
  };
}

/**
 * Creates board agent tools.
 */
export function createBoardAgentTools(
  options: CreateBoardAgentToolsOptions,
): BoardAgentToolFactoryResult {
  const createdObjectIdSet = new Set<string>();
  const operationsExecuted: BoardToolCall[] = [];
  const results: ExecuteToolResult[] = [];
  let deletedCount = 0;
  let toolCalls = 0;

  /**
   * Handles execute tool call.
   */
  async function executeToolCallWithGuardrails(
    toolCall: BoardToolCall,
  ): Promise<ExecuteToolResult> {
    toolCalls += 1;
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
      runtime: "agents-sdk",
    });

    try {
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
  }

  const defaultPoint = getDefaultPlacementPoint(options.viewportBounds);
  const explicitCoordinateHints = hasExplicitCoordinateHints(options.coordinateHints)
    ? options.coordinateHints
    : null;

  const tools: Tool[] = [
    tool({
      name: "getBoardState",
      description: getToolDescription(
        "getBoardState",
        "Read current board objects for planning.",
      ),
      parameters: z.object({}),
      execute: async () => {
        toolCalls += 1;
        const toolSpan = options.trace.startSpan("tool.execute.call", {
          tool: "getBoardState",
          operationIndex: operationsExecuted.length,
          argKeysJson: "[]",
          argsPreviewJson: "{}",
          x: null,
          y: null,
          objectIdsCount: 0,
          runtime: "agents-sdk",
        });
        try {
          const boardState = await options.executor.getBoardState();
          const output = {
            selectedObjectIds: options.selectedObjectIds,
            viewportBounds: options.viewportBounds,
            objectCount: boardState.length,
            boardObjects: boardState.slice(0, 160).map((objectItem) => ({
              id: objectItem.id,
              type: objectItem.type,
              x: objectItem.x,
              y: objectItem.y,
              width: objectItem.width,
              height: objectItem.height,
              color: objectItem.color,
              text: objectItem.text.slice(0, 120),
            })),
          };
          toolSpan.end({
            tool: "getBoardState",
            objectCount: boardState.length,
          });
          return output;
        } catch (error) {
          const reason =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : "Unknown getBoardState failure.";
          toolSpan.fail("Tool execution failed.", {
            tool: "getBoardState",
            reason,
          });
          throw error;
        }
      },
    }),
    tool({
      name: "createStickyNote",
      description: getToolDescription(
        "createStickyNote",
        "Create one sticky note.",
      ),
      parameters: z.object({
        text: z.string().min(1).max(1_000),
        x: z.number().nullable(),
        y: z.number().nullable(),
        color: z.string().nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "createStickyNote",
          args: {
            text: args.text,
            x: explicitCoordinateHints?.hintedX ?? args.x ?? defaultPoint.x,
            y: explicitCoordinateHints?.hintedY ?? args.y ?? defaultPoint.y,
            color: args.color ?? DEFAULT_STICKY_COLOR,
          },
        }),
    }),
    tool({
      name: "createStickyBatch",
      description: getToolDescription(
        "createStickyBatch",
        "Create many sticky notes in one call.",
      ),
      parameters: z.object({
        count: z.number().int().min(1).max(50),
        color: z.string().nullable(),
        originX: z.number().nullable(),
        originY: z.number().nullable(),
        columns: z.number().int().min(1).max(10).nullable(),
        gapX: z.number().min(0).max(400).nullable(),
        gapY: z.number().min(0).max(400).nullable(),
        textPrefix: z.string().max(1_000).nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "createStickyBatch",
          args: {
            count: args.count,
            color: args.color ?? DEFAULT_STICKY_COLOR,
            originX:
              explicitCoordinateHints?.hintedX ?? args.originX ?? defaultPoint.x,
            originY:
              explicitCoordinateHints?.hintedY ?? args.originY ?? defaultPoint.y,
            columns: args.columns ?? DEFAULT_BATCH_COLUMNS,
            gapX: args.gapX ?? DEFAULT_BATCH_GAP_X,
            gapY: args.gapY ?? DEFAULT_BATCH_GAP_Y,
            textPrefix: args.textPrefix ?? undefined,
          },
        }),
    }),
    tool({
      name: "createShape",
      description: getToolDescription(
        "createShape",
        "Create one board shape.",
      ),
      parameters: z.object({
        type: z.enum(["rect", "circle", "line", "triangle", "star"]),
        x: z.number().nullable(),
        y: z.number().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        color: z.string().nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "createShape",
          args: {
            type: args.type,
            x: explicitCoordinateHints?.hintedX ?? args.x ?? defaultPoint.x,
            y: explicitCoordinateHints?.hintedY ?? args.y ?? defaultPoint.y,
            width:
              args.width ??
              (args.type === "line" ? DEFAULT_LINE_WIDTH : DEFAULT_SHAPE_WIDTH),
            height:
              args.height ??
              (args.type === "line" ? DEFAULT_LINE_HEIGHT : DEFAULT_SHAPE_HEIGHT),
            color: args.color ?? DEFAULT_SHAPE_COLOR,
          },
        }),
    }),
    tool({
      name: "createGridContainer",
      description: getToolDescription(
        "createGridContainer",
        "Create a multi-section grid container.",
      ),
      parameters: z.object({
        x: z.number().nullable(),
        y: z.number().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        rows: z.number().int().min(1).max(8).nullable(),
        cols: z.number().int().min(1).max(8).nullable(),
        gap: z.number().min(0).max(80).nullable(),
        cellColors: z.array(z.string()).nullable(),
        containerTitle: z.string().max(120).nullable(),
        sectionTitles: z.array(z.string()).nullable(),
        sectionNotes: z.array(z.string()).nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "createGridContainer",
          args: {
            x: explicitCoordinateHints?.hintedX ?? args.x ?? defaultPoint.x,
            y: explicitCoordinateHints?.hintedY ?? args.y ?? defaultPoint.y,
            width: args.width ?? DEFAULT_GRID_CONTAINER_WIDTH,
            height: args.height ?? DEFAULT_GRID_CONTAINER_HEIGHT,
            rows: args.rows ?? 2,
            cols: args.cols ?? 2,
            gap: args.gap ?? 2,
            cellColors: args.cellColors ?? undefined,
            containerTitle: args.containerTitle ?? undefined,
            sectionTitles: args.sectionTitles ?? undefined,
            sectionNotes: args.sectionNotes ?? undefined,
          },
        }),
    }),
    tool({
      name: "createFrame",
      description: getToolDescription(
        "createFrame",
        "Create a frame rectangle with a title.",
      ),
      parameters: z.object({
        title: z.string().max(200).nullable(),
        x: z.number().nullable(),
        y: z.number().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "createFrame",
          args: {
            title: args.title ?? DEFAULT_FRAME_TITLE,
            x: explicitCoordinateHints?.hintedX ?? args.x ?? defaultPoint.x,
            y: explicitCoordinateHints?.hintedY ?? args.y ?? defaultPoint.y,
            width: args.width ?? DEFAULT_FRAME_WIDTH,
            height: args.height ?? DEFAULT_FRAME_HEIGHT,
          },
        }),
    }),
    tool({
      name: "createConnector",
      description: getToolDescription(
        "createConnector",
        "Connect two board objects by ID.",
      ),
      parameters: z.object({
        fromId: z.string().nullable(),
        toId: z.string().nullable(),
        style: z
          .enum(["undirected", "one-way-arrow", "two-way-arrow"])
          .nullable(),
      }),
      execute: async (args) => {
        const selectedIds = ensureObjectIds(
          undefined,
          options.selectedObjectIds,
          "createConnector",
        );
        const fromId = args.fromId ?? selectedIds[0];
        const toId = args.toId ?? selectedIds[1];
        if (!fromId || !toId || fromId === toId) {
          throw new Error(
            "createConnector needs two different object IDs (fromId and toId).",
          );
        }

        return executeToolCallWithGuardrails({
          tool: "createConnector",
          args: {
            fromId,
            toId,
            style: args.style ?? "undirected",
          },
        });
      },
    }),
    tool({
      name: "arrangeObjectsInGrid",
      description: getToolDescription(
        "arrangeObjectsInGrid",
        "Arrange selected objects into a grid.",
      ),
      parameters: z.object({
        objectIds: z.array(z.string()).nullable(),
        columns: z.number().int().min(1).max(8).nullable(),
        gapX: z.number().min(0).max(400).nullable(),
        gapY: z.number().min(0).max(400).nullable(),
        originX: z.number().nullable(),
        originY: z.number().nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "arrangeObjectsInGrid",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              options.selectedObjectIds,
              "arrangeObjectsInGrid",
            ),
            columns: args.columns ?? DEFAULT_GRID_COLUMNS,
            gapX: args.gapX ?? undefined,
            gapY: args.gapY ?? undefined,
            originX: args.originX ?? undefined,
            originY: args.originY ?? undefined,
          },
        }),
    }),
    tool({
      name: "alignObjects",
      description: getToolDescription("alignObjects", "Align selected objects."),
      parameters: z.object({
        objectIds: z.array(z.string()).nullable(),
        alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "alignObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              options.selectedObjectIds,
              "alignObjects",
            ),
            alignment: args.alignment,
          },
        }),
    }),
    tool({
      name: "distributeObjects",
      description: getToolDescription(
        "distributeObjects",
        "Distribute selected objects.",
      ),
      parameters: z.object({
        objectIds: z.array(z.string()).nullable(),
        axis: z.enum(["horizontal", "vertical"]),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "distributeObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              options.selectedObjectIds,
              "distributeObjects",
            ),
            axis: args.axis,
          },
        }),
    }),
    tool({
      name: "moveObject",
      description: getToolDescription(
        "moveObject",
        "Move one object to exact coordinates.",
      ),
      parameters: z.object({
        objectId: z.string().nullable(),
        x: z.number(),
        y: z.number(),
      }),
      execute: async (args) => {
        const objectId =
          args.objectId ??
          ensureObjectIds(undefined, options.selectedObjectIds, "moveObject")[0];
        if (!objectId) {
          throw new Error("moveObject requires objectId.");
        }

        return executeToolCallWithGuardrails({
          tool: "moveObject",
          args: {
            objectId,
            x: args.x,
            y: args.y,
          },
        });
      },
    }),
    tool({
      name: "moveObjects",
      description: getToolDescription("moveObjects", "Move multiple objects."),
      parameters: z.object({
        objectIds: z.array(z.string()).nullable(),
        delta: z
          .object({
            dx: z.number(),
            dy: z.number(),
          })
          .nullable(),
        toPoint: z
          .object({
            x: z.number(),
            y: z.number(),
          })
          .nullable(),
        toViewportSide: z
          .object({
            side: z.enum(["left", "right", "top", "bottom"]),
            viewportBounds: z
              .object({
                left: z.number(),
                top: z.number(),
                width: z.number(),
                height: z.number(),
              })
              .nullable(),
            padding: z.number().nullable(),
          })
          .nullable(),
      }),
      execute: async (args) => {
        if (!args.delta && !args.toPoint && !args.toViewportSide) {
          throw new Error(
            "moveObjects requires delta, toPoint, or toViewportSide.",
          );
        }

        return executeToolCallWithGuardrails({
          tool: "moveObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              options.selectedObjectIds,
              "moveObjects",
            ),
            delta: args.delta ?? undefined,
            toPoint: args.toPoint ?? undefined,
            toViewportSide: args.toViewportSide
              ? {
                  ...args.toViewportSide,
                  viewportBounds:
                    args.toViewportSide.viewportBounds ?? options.viewportBounds ?? undefined,
                  padding: args.toViewportSide.padding ?? undefined,
                }
              : undefined,
          },
        });
      },
    }),
    tool({
      name: "resizeObject",
      description: getToolDescription("resizeObject", "Resize one object."),
      parameters: z.object({
        objectId: z.string().nullable(),
        width: z.number(),
        height: z.number(),
      }),
      execute: async (args) => {
        const objectId =
          args.objectId ??
          ensureObjectIds(undefined, options.selectedObjectIds, "resizeObject")[0];
        if (!objectId) {
          throw new Error("resizeObject requires objectId.");
        }

        return executeToolCallWithGuardrails({
          tool: "resizeObject",
          args: {
            objectId,
            width: args.width,
            height: args.height,
          },
        });
      },
    }),
    tool({
      name: "updateText",
      description: getToolDescription("updateText", "Update object text."),
      parameters: z.object({
        objectId: z.string().nullable(),
        newText: z.string().min(1).max(1_000),
      }),
      execute: async (args) => {
        const objectId =
          args.objectId ??
          ensureObjectIds(undefined, options.selectedObjectIds, "updateText")[0];
        if (!objectId) {
          throw new Error("updateText requires objectId.");
        }

        return executeToolCallWithGuardrails({
          tool: "updateText",
          args: {
            objectId,
            newText: args.newText,
          },
        });
      },
    }),
    tool({
      name: "changeColor",
      description: getToolDescription("changeColor", "Change object color."),
      parameters: z.object({
        objectId: z.string().nullable(),
        color: z.string(),
      }),
      execute: async (args) => {
        const objectId =
          args.objectId ??
          ensureObjectIds(undefined, options.selectedObjectIds, "changeColor")[0];
        if (!objectId) {
          throw new Error("changeColor requires objectId.");
        }

        return executeToolCallWithGuardrails({
          tool: "changeColor",
          args: {
            objectId,
            color: args.color,
          },
        });
      },
    }),
    tool({
      name: "deleteObjects",
      description: getToolDescription("deleteObjects", "Delete board objects."),
      parameters: z.object({
        objectIds: z.array(z.string()).nullable(),
      }),
      execute: async (args) =>
        executeToolCallWithGuardrails({
          tool: "deleteObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              options.selectedObjectIds,
              "deleteObjects",
            ),
          },
        }),
    }),
    tool({
      name: "fitFrameToContents",
      description: getToolDescription(
        "fitFrameToContents",
        "Fit selected frame to its contents.",
      ),
      parameters: z.object({
        frameId: z.string().nullable(),
        padding: z.number().nullable(),
      }),
      execute: async (args) => {
        const frameId =
          args.frameId ??
          ensureObjectIds(
            undefined,
            options.selectedObjectIds,
            "fitFrameToContents",
          )[0];
        if (!frameId) {
          throw new Error("fitFrameToContents requires frameId.");
        }

        return executeToolCallWithGuardrails({
          tool: "fitFrameToContents",
          args: {
            frameId,
            padding: args.padding ?? undefined,
          },
        });
      },
    }),
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
