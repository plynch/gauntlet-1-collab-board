import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  DEFAULT_GRID_COLUMNS,
  DEFAULT_VIEWPORT_SIDE_PADDING,
  type BoardAgentToolBuildContext,
  ensureObjectIds,
  getToolDescription,
} from "@/features/ai/openai/agents/board-agent-tools/shared";

export function buildLayoutTools(context: BoardAgentToolBuildContext): Tool[] {
  return [
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
        viewportBounds: z
          .object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .nullable()
          .optional(),
        centerInViewport: z.boolean().nullable().optional(),
      }),
      execute: async (args) =>
        context.executeToolCallWithGuardrails({
          tool: "arrangeObjectsInGrid",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              context.options.selectedObjectIds,
              "arrangeObjectsInGrid",
            ),
            columns: args.columns ?? DEFAULT_GRID_COLUMNS,
            gapX: args.gapX ?? undefined,
            gapY: args.gapY ?? undefined,
            originX: args.originX ?? undefined,
            originY: args.originY ?? undefined,
            viewportBounds:
              args.viewportBounds ??
              ((args.centerInViewport ??
                context.options.messageIntentHints?.centerLayoutRequested) &&
              context.options.viewportBounds
                ? context.options.viewportBounds
                : undefined),
            centerInViewport:
              args.centerInViewport ??
              context.options.messageIntentHints?.centerLayoutRequested ??
              undefined,
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
        context.executeToolCallWithGuardrails({
          tool: "alignObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              context.options.selectedObjectIds,
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
        viewportBounds: z
          .object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .nullable(),
      }),
      execute: async (args) =>
        context.executeToolCallWithGuardrails({
          tool: "distributeObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              context.options.selectedObjectIds,
              "distributeObjects",
            ),
            axis: args.axis,
            viewportBounds:
              args.viewportBounds ??
              (context.options.messageIntentHints?.viewportLayoutRequested
                ? context.options.viewportBounds ?? undefined
                : undefined),
          },
        }),
    }),
    tool({
      name: "moveObject",
      description: getToolDescription("moveObject", "Move one object to exact coordinates."),
      parameters: z.object({
        objectId: z.string().nullable(),
        x: z.number(),
        y: z.number(),
      }),
      execute: async (args) => {
        const objectId =
          args.objectId ??
          ensureObjectIds(
            undefined,
            context.options.selectedObjectIds,
            "moveObject",
          )[0];
        if (!objectId) {
          throw new Error("moveObject requires objectId.");
        }
        return context.executeToolCallWithGuardrails({
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
        delta: z.object({ dx: z.number(), dy: z.number() }).nullable(),
        toPoint: z.object({ x: z.number(), y: z.number() }).nullable(),
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
          throw new Error("moveObjects requires delta, toPoint, or toViewportSide.");
        }
        return context.executeToolCallWithGuardrails({
          tool: "moveObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              context.options.selectedObjectIds,
              "moveObjects",
            ),
            delta: args.delta ?? undefined,
            toPoint: args.toPoint ?? undefined,
            toViewportSide: args.toViewportSide
              ? {
                  ...args.toViewportSide,
                  viewportBounds:
                    args.toViewportSide.viewportBounds ??
                    context.options.viewportBounds ??
                    undefined,
                  padding:
                    args.toViewportSide.padding ?? DEFAULT_VIEWPORT_SIDE_PADDING,
                }
              : undefined,
          },
        });
      },
    }),
  ];
}
