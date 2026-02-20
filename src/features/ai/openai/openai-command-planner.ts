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
const CANONICAL_TOOL_NAMES = BOARD_AI_TOOLS.map(
  (tool) => tool.name,
) as BoardToolCall["tool"][];

const TOOL_NAME_ALIASES: Record<string, BoardToolCall["tool"]> = {
  createSticky: "createStickyNote",
  create_sticky: "createStickyNote",
  sticky: "createStickyNote",
  addSticky: "createStickyNote",
  add_sticky: "createStickyNote",
  createNote: "createStickyNote",
  create_note: "createStickyNote",
  createLine: "createShape",
  create_line: "createShape",
  line: "createShape",
  move: "moveObject",
  moveSelected: "moveObject",
  resize: "resizeObject",
  resizeSelected: "resizeObject",
  setText: "updateText",
  updateObjectText: "updateText",
  setColor: "changeColor",
  updateColor: "changeColor",
  color: "changeColor",
  delete: "deleteObjects",
  deleteObject: "deleteObjects",
  removeObject: "deleteObjects",
  align: "alignObjects",
  distribute: "distributeObjects",
  arrangeGrid: "arrangeObjectsInGrid",
  arrangeInGrid: "arrangeObjectsInGrid",
};

const SHAPE_TYPE_ALIASES: Record<string, "rect" | "circle" | "line" | "triangle" | "star"> = {
  rectangle: "rect",
  square: "rect",
  oval: "circle",
  arrow: "line",
};

/**
 * Converts to plain object record.
 */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

/**
 * Handles parse number value.
 */
function parseNumberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/**
 * Handles normalize tool name.
 */
function normalizeToolName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const aliasMatch = TOOL_NAME_ALIASES[trimmed];
  if (aliasMatch) {
    return aliasMatch;
  }

  const compact = trimmed.replace(/[\s_-]/g, "");
  const canonicalMatch = CANONICAL_TOOL_NAMES.find(
    (toolName) =>
      toolName.replace(/[\s_-]/g, "").toLowerCase() === compact.toLowerCase(),
  );
  if (canonicalMatch) {
    return canonicalMatch;
  }

  for (const [alias, canonical] of Object.entries(TOOL_NAME_ALIASES)) {
    if (alias.toLowerCase() === compact.toLowerCase()) {
      return canonical;
    }
  }

  return trimmed;
}

/**
 * Handles normalize operation args.
 */
function normalizeOperationArgs(
  tool: string,
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const directArgs = asRecord(operation.args);
  const parameterArgs = asRecord(operation.parameters);
  const payloadArgs = asRecord(operation.payload);
  const inputArgs = asRecord(operation.input);
  const args: Record<string, unknown> = {
    ...(directArgs ?? {}),
    ...(parameterArgs ?? {}),
    ...(payloadArgs ?? {}),
    ...(inputArgs ?? {}),
  };

  // Support flat operation objects with no nested args.
  if (Object.keys(args).length === 0) {
    for (const [key, value] of Object.entries(operation)) {
      if (key === "tool") {
        continue;
      }
      args[key] = value;
    }
  }

  const position = asRecord(args.position);
  const size = asRecord(args.size);

  if (tool === "createStickyNote") {
    if (typeof args.text !== "string") {
      const textCandidate = args.content ?? args.message ?? args.label;
      if (typeof textCandidate === "string") {
        args.text = textCandidate;
      }
    }

    if (args.x === undefined && position) {
      args.x = position.x;
    }
    if (args.y === undefined && position) {
      args.y = position.y;
    }

    if (typeof args.color !== "string") {
      const colorCandidate = args.colour ?? args.fill;
      if (typeof colorCandidate === "string") {
        args.color = colorCandidate;
      }
    }
  }

  if (tool === "createShape") {
    if (args.x === undefined && position) {
      args.x = position.x;
    }
    if (args.y === undefined && position) {
      args.y = position.y;
    }
    if (args.width === undefined && size) {
      args.width = size.width;
    }
    if (args.height === undefined && size) {
      args.height = size.height;
    }

    if (typeof args.type === "string") {
      const normalizedShapeType =
        SHAPE_TYPE_ALIASES[args.type.toLowerCase()] ?? args.type.toLowerCase();
      args.type = normalizedShapeType;
    }

    const rawTool = String(operation.tool ?? "").toLowerCase();
    if (rawTool.includes("line") && typeof args.type !== "string") {
      args.type = "line";
    }
  }

  if (tool === "moveObject") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }
    if (args.x === undefined && position) {
      args.x = position.x;
    }
    if (args.y === undefined && position) {
      args.y = position.y;
    }
  }

  if (tool === "resizeObject") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }

    if (args.width === undefined && size) {
      args.width = size.width;
    }
    if (args.height === undefined && size) {
      args.height = size.height;
    }
  }

  if (tool === "updateText") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }

    if (typeof args.newText !== "string") {
      const textCandidate = args.text ?? args.value ?? args.content;
      if (typeof textCandidate === "string") {
        args.newText = textCandidate;
      }
    }
  }

  if (tool === "changeColor") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }

    if (typeof args.color !== "string") {
      const colorCandidate = args.colour ?? args.fill;
      if (typeof colorCandidate === "string") {
        args.color = colorCandidate;
      }
    }
  }

  if (tool === "deleteObjects") {
    if (!Array.isArray(args.objectIds)) {
      const objectId = args.objectId ?? args.id ?? args.targetId;
      if (typeof objectId === "string") {
        args.objectIds = [objectId];
      }
    }
  }

  if (tool === "arrangeObjectsInGrid") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }

    if (args.columns === undefined) {
      const colCandidate =
        parseNumberValue(args.cols) ?? parseNumberValue(args.columnCount);
      if (colCandidate !== null) {
        args.columns = colCandidate;
      }
    }
  }

  if (tool === "alignObjects") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }

    if (typeof args.alignment !== "string") {
      const alignmentCandidate = args.align ?? args.mode;
      if (typeof alignmentCandidate === "string") {
        args.alignment = alignmentCandidate.toLowerCase();
      }
    }
  }

  if (tool === "distributeObjects") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }

    if (typeof args.axis !== "string") {
      const axisCandidate = args.direction ?? args.distribution;
      if (typeof axisCandidate === "string") {
        args.axis = axisCandidate.toLowerCase();
      }
    }
  }

  return args;
}

/**
 * Normalizes openai planner output object.
 */
function normalizeOpenAiPlannerOutput(raw: unknown): unknown {
  const plannerOutput = asRecord(raw);
  if (!plannerOutput) {
    return raw;
  }

  const rawOperations = Array.isArray(plannerOutput.operations)
    ? plannerOutput.operations
    : [];

  const operations = rawOperations.map((value) => {
    const operation = asRecord(value);
    if (!operation) {
      return value;
    }

    const normalizedTool = normalizeToolName(operation.tool);
    if (!normalizedTool) {
      return value;
    }

    return {
      tool: normalizedTool,
      args: normalizeOperationArgs(normalizedTool, operation),
    };
  });

  return {
    ...plannerOutput,
    operations,
  };
}

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
  "Use only allowed tools with exact case-sensitive names from the provided tools list.",
  "Do not invent aliases (for example createSticky/addSticky/move/resize/delete).",
  "For line commands, always use tool=createShape with args.type='line'.",
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
  const normalizedOutput = normalizeOpenAiPlannerOutput(parsedJson);
  const parsed = openAiPlannerOutputSchema.parse(normalizedOutput);
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
