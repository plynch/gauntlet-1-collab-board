import {
  asRecord,
  parseObjectLikeValue,
} from "@/features/ai/openai/openai-command-planner/normalize-helpers";
import { normalizeCreateOperationArgs } from "@/features/ai/openai/openai-command-planner/normalize-create-args";
import { normalizeEditOperationArgs } from "@/features/ai/openai/openai-command-planner/normalize-edit-args";
import { normalizeLayoutOperationArgs } from "@/features/ai/openai/openai-command-planner/normalize-layout-args";

export function normalizeOperationArgs(
  tool: string,
  operation: Record<string, unknown>,
): Record<string, unknown> {
  const functionRecord = asRecord(operation.function);
  const callRecord = asRecord(operation.call);
  const actionRecord = asRecord(operation.action);
  const directArgs = asRecord(operation.args);
  const directArguments = parseObjectLikeValue(operation.arguments);
  const parameterArgs = asRecord(operation.parameters);
  const payloadArgs = asRecord(operation.payload);
  const inputArgs = asRecord(operation.input);
  const functionArgs = parseObjectLikeValue(functionRecord?.arguments);
  const callArgs = parseObjectLikeValue(callRecord?.arguments);
  const actionArgs = parseObjectLikeValue(actionRecord?.arguments);

  const args: Record<string, unknown> = {
    ...(directArgs ?? {}),
    ...(directArguments ?? {}),
    ...(parameterArgs ?? {}),
    ...(payloadArgs ?? {}),
    ...(inputArgs ?? {}),
    ...(functionArgs ?? {}),
    ...(callArgs ?? {}),
    ...(actionArgs ?? {}),
  };

  if (Object.keys(args).length === 0) {
    for (const [key, value] of Object.entries(operation)) {
      if (key !== "tool") {
        args[key] = value;
      }
    }
  }

  const position = asRecord(args.position);
  const size = asRecord(args.size);

  normalizeCreateOperationArgs({ tool, args, operation, position, size });
  normalizeEditOperationArgs({ tool, args, position, size });
  normalizeLayoutOperationArgs({ tool, args, position });

  return args;
}
