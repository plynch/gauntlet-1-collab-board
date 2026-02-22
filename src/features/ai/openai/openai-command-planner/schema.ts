import { z } from "zod";

import { MAX_TOOL_CALLS } from "@/features/ai/openai/openai-command-planner/constants";
import type { BoardToolCall } from "@/features/ai/types";

export const boardToolCallSchema: z.ZodType<BoardToolCall> = z.discriminatedUnion(
  "tool",
  [
    z.object({
      tool: z.literal("createStickyNote"),
      args: z.object({
        text: z.string().max(1_000),
        x: z.number(),
        y: z.number(),
        color: z.string(),
      }),
    }),
    z.object({
      tool: z.literal("createStickyBatch"),
      args: z.object({
        count: z.number(),
        color: z.string(),
        originX: z.number(),
        originY: z.number(),
        columns: z.number().optional(),
        gapX: z.number().optional(),
        gapY: z.number().optional(),
        textPrefix: z.string().max(1_000).optional(),
      }),
    }),
    z.object({
      tool: z.literal("createShape"),
      args: z.object({
        type: z.enum(["rect", "circle", "line", "triangle", "star"]),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        color: z.string(),
      }),
    }),
    z.object({
      tool: z.literal("createGridContainer"),
      args: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        rows: z.number(),
        cols: z.number(),
        gap: z.number(),
        cellColors: z.array(z.string()).optional(),
        containerTitle: z.string().optional(),
        sectionTitles: z.array(z.string()).optional(),
        sectionNotes: z.array(z.string()).optional(),
      }),
    }),
    z.object({
      tool: z.literal("createFrame"),
      args: z.object({
        title: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
    }),
    z.object({
      tool: z.literal("createConnector"),
      args: z.object({
        fromId: z.string(),
        toId: z.string(),
        style: z.enum(["undirected", "one-way-arrow", "two-way-arrow"]),
      }),
    }),
    z.object({
      tool: z.literal("arrangeObjectsInGrid"),
      args: z.object({
        objectIds: z.array(z.string()),
        columns: z.number(),
        gapX: z.number().optional(),
        gapY: z.number().optional(),
        originX: z.number().optional(),
        originY: z.number().optional(),
        viewportBounds: z
          .object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
        centerInViewport: z.boolean().optional(),
      }),
    }),
    z.object({
      tool: z.literal("alignObjects"),
      args: z.object({
        objectIds: z.array(z.string()),
        alignment: z.enum(["left", "center", "right", "top", "middle", "bottom"]),
      }),
    }),
    z.object({
      tool: z.literal("distributeObjects"),
      args: z.object({
        objectIds: z.array(z.string()),
        axis: z.enum(["horizontal", "vertical"]),
        viewportBounds: z
          .object({
            left: z.number(),
            top: z.number(),
            width: z.number(),
            height: z.number(),
          })
          .optional(),
      }),
    }),
    z.object({
      tool: z.literal("moveObject"),
      args: z.object({
        objectId: z.string(),
        x: z.number(),
        y: z.number(),
      }),
    }),
    z.object({
      tool: z.literal("moveObjects"),
      args: z
        .object({
          objectIds: z.array(z.string()),
          delta: z.object({ dx: z.number(), dy: z.number() }).optional(),
          toPoint: z.object({ x: z.number(), y: z.number() }).optional(),
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
                .optional(),
              padding: z.number().optional(),
            })
            .optional(),
        })
        .superRefine((value, context) => {
          if (!value.delta && !value.toPoint && !value.toViewportSide) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "moveObjects requires one of delta, toPoint, or toViewportSide.",
              path: ["delta"],
            });
          }
        }),
    }),
    z.object({
      tool: z.literal("resizeObject"),
      args: z.object({
        objectId: z.string(),
        width: z.number(),
        height: z.number(),
      }),
    }),
    z.object({
      tool: z.literal("updateText"),
      args: z.object({
        objectId: z.string(),
        newText: z.string(),
      }),
    }),
    z.object({
      tool: z.literal("changeColor"),
      args: z.object({
        objectId: z.string(),
        color: z.string(),
      }),
    }),
    z.object({
      tool: z.literal("deleteObjects"),
      args: z.object({
        objectIds: z.array(z.string()),
      }),
    }),
    z.object({
      tool: z.literal("fitFrameToContents"),
      args: z.object({
        frameId: z.string(),
        padding: z.number().optional(),
      }),
    }),
    z.object({
      tool: z.literal("getBoardState"),
      args: z.object({}).optional(),
    }),
  ],
);

export const openAiPlannerOutputSchema = z
  .object({
    intent: z.string().min(1).max(120),
    planned: z.boolean(),
    assistantMessage: z.string().min(1).max(1_000),
    operations: z.array(boardToolCallSchema).max(MAX_TOOL_CALLS).default([]),
  })
  .superRefine((value, context) => {
    if (value.planned && value.operations.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "planned=true requires at least one operation.",
        path: ["operations"],
      });
    }
  });
