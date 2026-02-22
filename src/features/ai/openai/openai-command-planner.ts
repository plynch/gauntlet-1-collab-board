import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import { estimateOpenAiCostUsd } from "@/features/ai/openai/openai-cost-controls";
import {
  getOpenAiClient,
  getOpenAiPlannerConfig,
} from "@/features/ai/openai/openai-client";
import { MAX_TEXT_PREVIEW_CHARS } from "@/features/ai/openai/openai-command-planner/constants";
import { parseOpenAiPlannerOutput } from "@/features/ai/openai/openai-command-planner/parser";
import { OPENAI_PLANNER_SYSTEM_PROMPT } from "@/features/ai/openai/openai-command-planner/prompt";
import type {
  OpenAiPlannerFailureError,
  OpenAiPlannerResult,
  OpenAiPlannerUsage,
} from "@/features/ai/openai/openai-command-planner/types";
import type { BoardObjectSnapshot } from "@/features/ai/types";

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

function getOpenAiPlannerUsage(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
}): OpenAiPlannerUsage {
  const totalTokens = input.inputTokens + input.outputTokens;
  const estimatedCostUsd = estimateOpenAiCostUsd({
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    inputCostPerMillionUsd: input.inputCostPerMillionUsd,
    outputCostPerMillionUsd: input.outputCostPerMillionUsd,
  });
  return {
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalTokens,
    estimatedCostUsd,
  };
}

function createOpenAiPlannerFailureError(
  reason: string,
  usage: OpenAiPlannerUsage,
): OpenAiPlannerFailureError {
  const error = new Error(reason) as OpenAiPlannerFailureError;
  error.usage = usage;
  return error;
}

function getCompactTextPreview(value: string, maxChars: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxChars) {
    return compact;
  }
  return `${compact.slice(0, maxChars)}…`;
}

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
    tools: BOARD_AI_TOOLS,
  };

  const completion = await client.chat.completions.create({
    model: config.model,
    temperature: 0,
    max_tokens: config.maxOutputTokens,
    response_format: {
      type: "json_object",
    },
    messages: [
      { role: "system", content: OPENAI_PLANNER_SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  });

  const usage = getOpenAiPlannerUsage({
    model: config.model,
    inputTokens: completion.usage?.prompt_tokens ?? 0,
    outputTokens: completion.usage?.completion_tokens ?? 0,
    inputCostPerMillionUsd: config.inputCostPerMillionUsd,
    outputCostPerMillionUsd: config.outputCostPerMillionUsd,
  });

  const content = completion.choices[0]?.message?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw createOpenAiPlannerFailureError(
      "OpenAI planner returned empty content.",
      usage,
    );
  }

  let parsed: ReturnType<typeof parseOpenAiPlannerOutput>;
  try {
    parsed = parseOpenAiPlannerOutput(content);
  } catch (error) {
    const reason =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "OpenAI planner returned invalid JSON output.";
    const preview = getCompactTextPreview(content, 300);
    throw createOpenAiPlannerFailureError(
      `${reason} (plannerPreview=${JSON.stringify(preview)})`,
      usage,
    );
  }

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
    usage,
  };
}

export { parseOpenAiPlannerOutput } from "@/features/ai/openai/openai-command-planner/parser";
export type {
  OpenAiPlannerFailureError,
  OpenAiPlannerResult,
  OpenAiPlannerUsage,
} from "@/features/ai/openai/openai-command-planner/types";
