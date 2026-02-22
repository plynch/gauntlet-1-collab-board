import {
  CANONICAL_TOOL_NAMES,
  TOOL_NAME_ALIASES,
} from "@/features/ai/openai/openai-command-planner/constants";

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

export function parseObjectLikeValue(
  value: unknown,
): Record<string, unknown> | null {
  const direct = asRecord(value);
  if (direct) {
    return direct;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
    return null;
  }
  try {
    return asRecord(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

export function parseNumberValue(value: unknown): number | null {
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

export function normalizeToolName(value: unknown): string | null {
  const structured = asRecord(value);
  if (structured && typeof structured.name === "string") {
    return normalizeToolName(structured.name);
  }
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

export function getOperationToolCandidate(
  operation: Record<string, unknown>,
): unknown {
  const functionRecord = asRecord(operation.function);
  const callRecord = asRecord(operation.call);
  const actionRecord = asRecord(operation.action);
  return (
    operation.tool ??
    operation.name ??
    functionRecord?.name ??
    callRecord?.tool ??
    callRecord?.name ??
    actionRecord?.tool ??
    actionRecord?.name ??
    operation.type
  );
}
