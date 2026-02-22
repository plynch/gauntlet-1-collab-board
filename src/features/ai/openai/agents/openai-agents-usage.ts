import { estimateOpenAiCostUsd } from "@/features/ai/openai/openai-cost-controls";

export type OpenAiAgentsRunnerUsage = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export function toOpenAiUsage(input: {
  model: string;
  inputTokens: number;
  outputTokens: number;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
}): OpenAiAgentsRunnerUsage {
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

export function createEmptyUsage(model: string): OpenAiAgentsRunnerUsage {
  return {
    model,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
  };
}
