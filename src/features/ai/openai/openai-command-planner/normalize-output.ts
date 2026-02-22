import {
  getOperationToolCandidate,
  normalizeToolName,
  parseObjectLikeValue,
  asRecord,
} from "@/features/ai/openai/openai-command-planner/normalize-helpers";
import { normalizeOperationArgs } from "@/features/ai/openai/openai-command-planner/normalize-operation-args";

export function normalizeOpenAiPlannerOutput(raw: unknown): unknown {
  const plannerOutput = asRecord(raw);
  if (!plannerOutput) {
    return raw;
  }

  const rawOperations = Array.isArray(plannerOutput.operations)
    ? plannerOutput.operations
    : Array.isArray(plannerOutput.toolCalls)
      ? plannerOutput.toolCalls
      : Array.isArray(plannerOutput.calls)
        ? plannerOutput.calls
        : plannerOutput.operation
          ? [plannerOutput.operation]
          : [];

  const operations = rawOperations.map((value) => {
    const operation = parseObjectLikeValue(value);
    if (!operation) {
      return value;
    }
    const normalizedTool = normalizeToolName(getOperationToolCandidate(operation));
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
