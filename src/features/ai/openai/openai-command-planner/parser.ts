import type { BoardToolCall } from "@/features/ai/types";
import { normalizeOpenAiPlannerOutput } from "@/features/ai/openai/openai-command-planner/normalize-output";
import { openAiPlannerOutputSchema } from "@/features/ai/openai/openai-command-planner/schema";

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
