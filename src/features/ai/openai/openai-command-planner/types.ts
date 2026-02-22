import type { TemplatePlan } from "@/features/ai/types";

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

export type OpenAiPlannerFailureError = Error & {
  usage?: OpenAiPlannerUsage;
};
