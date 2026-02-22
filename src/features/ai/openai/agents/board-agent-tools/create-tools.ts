import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import { resolveStickyBatchLayout } from "@/features/ai/openai/agents/board-agent-tools/sticky-layout";
import {
  DEFAULT_BATCH_GAP_X,
  DEFAULT_BATCH_GAP_Y,
  DEFAULT_FRAME_HEIGHT,
  DEFAULT_FRAME_TITLE,
  DEFAULT_FRAME_WIDTH,
  DEFAULT_GRID_CONTAINER_HEIGHT,
  DEFAULT_GRID_CONTAINER_WIDTH,
  DEFAULT_LINE_HEIGHT,
  DEFAULT_LINE_WIDTH,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_SHAPE_HEIGHT,
  DEFAULT_SHAPE_WIDTH,
  DEFAULT_STICKY_COLOR,
  type BoardAgentToolBuildContext,
  ensureObjectIds,
  getToolDescription,
  toBoundedInt,
} from "@/features/ai/openai/agents/board-agent-tools/shared";

export function buildCreateTools(context: BoardAgentToolBuildContext): Tool[] {
  const getBoardStateTool = tool({
    name: "getBoardState",
    description: getToolDescription(
      "getBoardState",
      "Read current board objects for planning.",
    ),
    parameters: z.object({}),
    execute: async () => {
      context.incrementToolCalls();
      const toolSpan = context.options.trace.startSpan("tool.execute.call", {
        tool: "getBoardState",
        argKeysJson: "[]",
        argsPreviewJson: "{}",
        x: null,
        y: null,
        objectIdsCount: 0,
        runtime: "agents-sdk",
      });
      try {
        const boardState = await context.options.executor.getBoardState();
        const output = {
          selectedObjectIds: context.options.selectedObjectIds,
          viewportBounds: context.options.viewportBounds,
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
        toolSpan.end({ tool: "getBoardState", objectCount: boardState.length });
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
  });

  return [
    ...(context.options.messageIntentHints?.stickyCreateRequest
      ? []
      : [getBoardStateTool]),
    tool({
      name: "createStickyNote",
      description: getToolDescription("createStickyNote", "Create one sticky note."),
      parameters: z.object({
        text: z.string().min(1).max(1_000),
        x: z.number().nullable(),
        y: z.number().nullable(),
        color: z.string().nullable(),
      }),
      execute: async (args) =>
        context.executeToolCallWithGuardrails({
          tool: "createStickyNote",
          args: {
            text: args.text,
            x:
              context.explicitCoordinateHints?.hintedX ??
              args.x ??
              context.defaultPoint.x,
            y:
              context.explicitCoordinateHints?.hintedY ??
              args.y ??
              context.defaultPoint.y,
            color:
              context.options.messageIntentHints?.stickyColorHint ??
              args.color ??
              DEFAULT_STICKY_COLOR,
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
      execute: async (args) => {
        const count = toBoundedInt(args.count, 1, 1, 50);
        const resolvedLayout = resolveStickyBatchLayout({
          count,
          args: {
            originX: args.originX,
            originY: args.originY,
            columns: args.columns,
            gapX: args.gapX,
            gapY: args.gapY,
          },
          viewportBounds: context.options.viewportBounds,
          defaultPoint: context.defaultPoint,
          explicitCoordinateHints: context.explicitCoordinateHints,
          messageIntentHints: context.options.messageIntentHints,
        });
        return context.executeToolCallWithGuardrails(
          {
            tool: "createStickyBatch",
            args: {
              count,
              color:
                context.options.messageIntentHints?.stickyColorHint ??
                args.color ??
                DEFAULT_STICKY_COLOR,
              originX: resolvedLayout.originX,
              originY: resolvedLayout.originY,
              columns: resolvedLayout.columns,
              gapX: resolvedLayout.gapX ?? DEFAULT_BATCH_GAP_X,
              gapY: resolvedLayout.gapY ?? DEFAULT_BATCH_GAP_Y,
              textPrefix: args.textPrefix ?? undefined,
            },
          },
          {
            layoutMode: resolvedLayout.layoutMode,
            resolvedColumns: resolvedLayout.columns,
            resolvedGapX: resolvedLayout.gapX,
            resolvedGapY: resolvedLayout.gapY,
          },
        );
      },
    }),
    tool({
      name: "createShape",
      description: getToolDescription("createShape", "Create one board shape."),
      parameters: z.object({
        type: z.enum(["rect", "circle", "line", "triangle", "star"]),
        x: z.number().nullable(),
        y: z.number().nullable(),
        width: z.number().nullable(),
        height: z.number().nullable(),
        color: z.string().nullable(),
      }),
      execute: async (args) =>
        context.executeToolCallWithGuardrails({
          tool: "createShape",
          args: {
            type: args.type,
            x:
              context.explicitCoordinateHints?.hintedX ??
              args.x ??
              context.defaultPoint.x,
            y:
              context.explicitCoordinateHints?.hintedY ??
              args.y ??
              context.defaultPoint.y,
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
        context.executeToolCallWithGuardrails({
          tool: "createGridContainer",
          args: {
            x: context.explicitCoordinateHints?.hintedX ?? args.x ?? context.defaultPoint.x,
            y: context.explicitCoordinateHints?.hintedY ?? args.y ?? context.defaultPoint.y,
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
        context.executeToolCallWithGuardrails({
          tool: "createFrame",
          args: {
            title: args.title ?? DEFAULT_FRAME_TITLE,
            x: context.explicitCoordinateHints?.hintedX ?? args.x ?? context.defaultPoint.x,
            y: context.explicitCoordinateHints?.hintedY ?? args.y ?? context.defaultPoint.y,
            width: args.width ?? DEFAULT_FRAME_WIDTH,
            height: args.height ?? DEFAULT_FRAME_HEIGHT,
          },
        }),
    }),
    tool({
      name: "createConnector",
      description: getToolDescription("createConnector", "Connect two board objects by ID."),
      parameters: z.object({
        fromId: z.string().nullable(),
        toId: z.string().nullable(),
        style: z.enum(["undirected", "one-way-arrow", "two-way-arrow"]).nullable(),
      }),
      execute: async (args) => {
        const selectedIds = ensureObjectIds(
          undefined,
          context.options.selectedObjectIds,
          "createConnector",
        );
        const fromId = args.fromId ?? selectedIds[0];
        const toId = args.toId ?? selectedIds[1];
        if (!fromId || !toId || fromId === toId) {
          throw new Error(
            "createConnector needs two different object IDs (fromId and toId).",
          );
        }
        return context.executeToolCallWithGuardrails({
          tool: "createConnector",
          args: { fromId, toId, style: args.style ?? "undirected" },
        });
      },
    }),
  ];
}
