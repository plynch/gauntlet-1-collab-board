import { z } from "zod";

import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import { estimateOpenAiCostUsd } from "@/features/ai/openai/openai-cost-controls";
import {
  getOpenAiClient,
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import type { BoardObjectSnapshot, BoardToolCall, TemplatePlan } from "@/features/ai/types";

const MAX_TOOL_CALLS = 50;
const MAX_TEXT_PREVIEW_CHARS = 120;

const boardToolCallSchema: z.ZodType<BoardToolCall> = z.discriminatedUnion(
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
      }),
    }),
    z.object({
      tool: z.literal("alignObjects"),
      args: z.object({
        objectIds: z.array(z.string()),
        alignment: z.enum([
          "left",
          "center",
          "right",
          "top",
          "middle",
          "bottom",
        ]),
      }),
    }),
    z.object({
      tool: z.literal("distributeObjects"),
      args: z.object({
        objectIds: z.array(z.string()),
        axis: z.enum(["horizontal", "vertical"]),
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
      tool: z.literal("getBoardState"),
      args: z.object({}).optional(),
    }),
  ],
);

const openAiPlannerOutputSchema = z
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

const OPENAI_PLANNER_SYSTEM_PROMPT = [
  "You are the CollabBoard operation planner.",
  "Convert user commands into structured board tool operations.",
  "Return strict JSON with keys: intent, planned, assistantMessage, operations.",
  "Use only allowed tools.",
  `If you cannot safely map a command, set planned=false with a helpful assistantMessage and operations=[].`,
  `When planned=true, keep operations to ${MAX_TOOL_CALLS} or fewer and do not invent unknown object ids.`,
  "Prefer deterministic direct edits over verbose multi-step plans.",
].join("\n");

export type OpenAiPlannerUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type OpenAiPlannerResult = {
  intent: string;
  planned: boolean;
  assistantMessage: string;
  plan: TemplatePlan | null;
  usage: OpenAiPlannerUsage;
};

/**
 * Handles to board context object.
 */
function toBoardContextObject(objectItem: BoardObjectSnapshot) {
  return {
    id: objectItem.id,
    type: objectItem.type,
    x: objectItem.x,
    y: objectItem.y,
    width: objectItem.width,
    height: objectItem.height,
    color: objectItem.color,
    text: objectItem.text.slice(0, MAX_TEXT_PREVIEW_CHARS),
  };
}

/**
 * Extracts json candidate from text.
 */
function extractJsonCandidate(content: string): string {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBraceIndex = content.indexOf("{");
  const lastBraceIndex = content.lastIndexOf("}");
  if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
    return content.slice(firstBraceIndex, lastBraceIndex + 1).trim();
  }

  return content.trim();
}

/**
 * Parses openai planner output.
 */
export function parseOpenAiPlannerOutput(content: string): {
  intent: string;
  planned: boolean;
  assistantMessage: string;
  operations: BoardToolCall[];
} {
  const parsedJson = JSON.parse(extractJsonCandidate(content)) as unknown;
  const parsed = openAiPlannerOutputSchema.parse(parsedJson);
  return {
    intent: parsed.intent,
    planned: parsed.planned,
    assistantMessage: parsed.assistantMessage,
    operations: parsed.operations,
  };
}

/**
 * Plans board command with openai.
 */
export async function planBoardCommandWithOpenAi(input: {
  message: string;
  selectedObjectIds: string[];
  boardState: BoardObjectSnapshot[];
}): Promise<OpenAiPlannerResult> {
  const config = getOpenAiPlannerConfig();
  const client = getOpenAiClient();
  if (!config.enabled || !client) {
    throw new Error("OpenAI planner is not enabled.");
  }

  const contextObjects = input.boardState
    .slice(0, config.maxContextObjects)
    .map(toBoardContextObject);
  const selectedLookup = new Set(input.selectedObjectIds);
  const selectedContext = contextObjects.filter((objectItem) =>
    selectedLookup.has(objectItem.id),
  );

  const userPayload = {
    message: input.message,
    selectedObjectIds: input.selectedObjectIds,
    selectedObjects: selectedContext,
    boardObjectCount: input.boardState.length,
    boardObjects: contextObjects,
    tools: BOARD_AI_TOOLS.map((tool) => ({
      name: tool.name,
      description: tool.description,
    })),
  };

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    max_tokens: config.maxOutputTokens,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: OPENAI_PLANNER_SYSTEM_PROMPT,
      },
      {
        role: "user",
        content: JSON.stringify(userPayload),
      },
    ],
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("OpenAI planner returned empty content.");
  }

  const parsed = parseOpenAiPlannerOutput(content);
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const totalTokens = completion.usage?.total_tokens ?? inputTokens + outputTokens;
  const estimatedCostUsd = estimateOpenAiCostUsd({
    inputTokens,
    outputTokens,
    inputCostPerMillionUsd: config.inputCostPerMillionUsd,
    outputCostPerMillionUsd: config.outputCostPerMillionUsd,
  });

  return {
    intent: parsed.intent,
    planned: parsed.planned,
    assistantMessage: parsed.assistantMessage,
    plan: parsed.planned
      ? {
          templateId: `openai.plan.${parsed.intent}`,
          templateName: "OpenAI Planned Command",
          operations: parsed.operations,
        }
      : null,
    usage: {
      model: config.model,
      inputTokens,
      outputTokens,
      totalTokens,
      estimatedCostUsd,
    },
  };
}
