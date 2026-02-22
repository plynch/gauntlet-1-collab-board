import { tool, type Tool } from "@openai/agents";
import { z } from "zod";

import {
  type BoardAgentToolBuildContext,
  ensureObjectIds,
  getToolDescription,
} from "@/features/ai/openai/agents/board-agent-tools/shared";

export function buildEditTools(context: BoardAgentToolBuildContext): Tool[] {
  return [
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
          ensureObjectIds(
            undefined,
            context.options.selectedObjectIds,
            "resizeObject",
          )[0];
        if (!objectId) {
          throw new Error("resizeObject requires objectId.");
        }
        return context.executeToolCallWithGuardrails({
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
          ensureObjectIds(
            undefined,
            context.options.selectedObjectIds,
            "updateText",
          )[0];
        if (!objectId) {
          throw new Error("updateText requires objectId.");
        }
        return context.executeToolCallWithGuardrails({
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
          ensureObjectIds(
            undefined,
            context.options.selectedObjectIds,
            "changeColor",
          )[0];
        if (!objectId) {
          throw new Error("changeColor requires objectId.");
        }
        return context.executeToolCallWithGuardrails({
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
        context.executeToolCallWithGuardrails({
          tool: "deleteObjects",
          args: {
            objectIds: ensureObjectIds(
              args.objectIds,
              context.options.selectedObjectIds,
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
            context.options.selectedObjectIds,
            "fitFrameToContents",
          )[0];
        if (!frameId) {
          throw new Error("fitFrameToContents requires frameId.");
        }
        return context.executeToolCallWithGuardrails({
          tool: "fitFrameToContents",
          args: {
            frameId,
            padding: args.padding ?? undefined,
          },
        });
      },
    }),
  ];
}
