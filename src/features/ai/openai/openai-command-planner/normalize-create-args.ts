import { SHAPE_TYPE_ALIASES } from "@/features/ai/openai/openai-command-planner/constants";
import {
  getOperationToolCandidate,
  parseNumberValue,
} from "@/features/ai/openai/openai-command-planner/normalize-helpers";

type OperationArgsInput = {
  tool: string;
  args: Record<string, unknown>;
  operation: Record<string, unknown>;
  position: Record<string, unknown> | null;
  size: Record<string, unknown> | null;
};

export function normalizeCreateOperationArgs({
  tool,
  args,
  operation,
  position,
  size,
}: OperationArgsInput): void {
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
    return;
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
      args.type = SHAPE_TYPE_ALIASES[args.type.toLowerCase()] ?? args.type.toLowerCase();
    }
    const rawTool = String(getOperationToolCandidate(operation) ?? "").toLowerCase();
    if (rawTool.includes("line") && typeof args.type !== "string") {
      args.type = "line";
    }
    return;
  }

  if (tool !== "createStickyBatch") {
    return;
  }

  if (args.count === undefined) {
    const countCandidate =
      parseNumberValue(args.n) ??
      parseNumberValue(args.quantity) ??
      parseNumberValue(args.total);
    if (countCandidate !== null) {
      args.count = countCandidate;
    }
  }
  if (args.originX === undefined && position) {
    args.originX = position.x;
  }
  if (args.originY === undefined && position) {
    args.originY = position.y;
  }
  if (args.originX === undefined && args.x !== undefined) {
    args.originX = args.x;
  }
  if (args.originY === undefined && args.y !== undefined) {
    args.originY = args.y;
  }
  if (typeof args.color !== "string") {
    const colorCandidate = args.colour ?? args.fill;
    if (typeof colorCandidate === "string") {
      args.color = colorCandidate;
    }
  }
  if (args.columns === undefined) {
    const colCandidate =
      parseNumberValue(args.cols) ?? parseNumberValue(args.columnCount);
    if (colCandidate !== null) {
      args.columns = colCandidate;
    }
  }
  if (args.gapX === undefined && args.gapY === undefined) {
    const uniformGapCandidate = parseNumberValue(args.gap);
    if (uniformGapCandidate !== null) {
      args.gapX = uniformGapCandidate;
      args.gapY = uniformGapCandidate;
    }
  }
  if (typeof args.textPrefix !== "string") {
    const textPrefixCandidate = args.text ?? args.prefix;
    if (typeof textPrefixCandidate === "string") {
      args.textPrefix = textPrefixCandidate;
    }
  }
}
