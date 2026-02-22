import { type Tool } from "@openai/agents";

import { BOARD_AI_TOOLS } from "@/features/ai/board-tool-schema";
import type { CoordinateHints } from "@/features/ai/commands/coordinate-hints";
import { MAX_AI_CREATED_OBJECTS_PER_COMMAND } from "@/features/ai/guardrails";
import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import type { OpenAiMessageIntentHints } from "@/features/ai/openai/agents/message-intent-hints";
import { BoardToolExecutor } from "@/features/ai/tools/board-tools";
import type {
  BoardToolCall,
  TemplatePlan,
  ViewportBounds,
} from "@/features/ai/types";

export const DEFAULT_X = 160;
export const DEFAULT_Y = 160;
export const DEFAULT_STICKY_COLOR = "#fde68a";
export const DEFAULT_SHAPE_COLOR = "#93c5fd";
export const DEFAULT_GRID_CONTAINER_WIDTH = 1_200;
export const DEFAULT_GRID_CONTAINER_HEIGHT = 700;
export const DEFAULT_FRAME_TITLE = "Frame";
export const DEFAULT_FRAME_WIDTH = 900;
export const DEFAULT_FRAME_HEIGHT = 600;
export const DEFAULT_SHAPE_WIDTH = 220;
export const DEFAULT_SHAPE_HEIGHT = 160;
export const DEFAULT_LINE_WIDTH = 220;
export const DEFAULT_LINE_HEIGHT = 24;
export const DEFAULT_GRID_COLUMNS = 3;
export const DEFAULT_BATCH_COLUMNS = 5;
export const DEFAULT_BATCH_GAP_X = 240;
export const DEFAULT_BATCH_GAP_Y = 190;
export const STICKY_WIDTH = 180;
export const STICKY_HEIGHT = 140;
export const STICKY_MIN_STEP_X = STICKY_WIDTH + 24;
export const STICKY_MIN_STEP_Y = STICKY_HEIGHT + 24;
export const DEFAULT_VIEWPORT_SIDE_PADDING = 0;

export type ExecuteToolResult = Awaited<
  ReturnType<BoardToolExecutor["executeToolCall"]>
>;

export type BoardAgentToolExecutionSnapshot = {
  operationsExecuted: BoardToolCall[];
  results: ExecuteToolResult[];
  createdObjectIds: string[];
  deletedCount: number;
  toolCalls: number;
};

export type CreateBoardAgentToolsOptions = {
  executor: BoardToolExecutor;
  trace: AiTraceRun;
  selectedObjectIds: string[];
  viewportBounds: ViewportBounds | null;
  coordinateHints?: CoordinateHints | null;
  messageIntentHints?: OpenAiMessageIntentHints;
};

export type BoardAgentToolFactoryResult = {
  tools: Tool[];
  getExecutionSnapshot: () => BoardAgentToolExecutionSnapshot;
  executeToolCallForTests: (
    toolCall: BoardToolCall,
  ) => Promise<ExecuteToolResult>;
};

export type BoardAgentToolBuildContext = {
  options: CreateBoardAgentToolsOptions;
  defaultPoint: { x: number; y: number };
  explicitCoordinateHints: { hintedX: number; hintedY: number } | null;
  executeToolCallWithGuardrails: (
    toolCall: BoardToolCall,
    traceMetadata?: Record<string, unknown>,
  ) => Promise<ExecuteToolResult>;
  incrementToolCalls: () => void;
};

export function getToolDescription(
  name: BoardToolCall["tool"],
  fallback: string,
): string {
  const match = BOARD_AI_TOOLS.find((toolItem) => toolItem.name === name);
  return match?.description ?? fallback;
}

export function isMutatingToolCall(toolCall: BoardToolCall): boolean {
  return toolCall.tool !== "getBoardState";
}

export function createsObjects(toolCall: BoardToolCall): boolean {
  return (
    toolCall.tool === "createStickyNote" ||
    toolCall.tool === "createStickyBatch" ||
    toolCall.tool === "createShape" ||
    toolCall.tool === "createShapeBatch" ||
    toolCall.tool === "createGridContainer" ||
    toolCall.tool === "createFrame" ||
    toolCall.tool === "createConnector"
  );
}

export function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toBoundedInt(
  value: number | null | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

export function getDefaultPlacementPoint(
  viewportBounds: ViewportBounds | null,
): { x: number; y: number } {
  if (viewportBounds) {
    return {
      x: viewportBounds.left + Math.max(40, Math.floor(viewportBounds.width * 0.2)),
      y: viewportBounds.top + Math.max(40, Math.floor(viewportBounds.height * 0.2)),
    };
  }
  return { x: DEFAULT_X, y: DEFAULT_Y };
}

export function hasExplicitCoordinateHints(
  hints: CoordinateHints | null | undefined,
): hints is { hintedX: number; hintedY: number } {
  return (
    typeof hints?.hintedX === "number" &&
    Number.isFinite(hints.hintedX) &&
    typeof hints?.hintedY === "number" &&
    Number.isFinite(hints.hintedY)
  );
}

export function ensureObjectIds(
  objectIds: string[] | null | undefined,
  selectedObjectIds: string[],
  toolName: string,
): string[] {
  const source =
    Array.isArray(objectIds) && objectIds.length > 0 ? objectIds : selectedObjectIds;
  const resolved = Array.from(
    new Set(
      source
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  );
  if (resolved.length === 0) {
    throw new Error(
      `${toolName} requires object IDs. Select one or more objects and retry.`,
    );
  }
  return resolved;
}

export function buildSyntheticPlan(operations: BoardToolCall[]): TemplatePlan {
  return {
    templateId: "openai.agents.direct-tools",
    templateName: "OpenAI Agents Direct Tools",
    operations,
  };
}

export function getMaxAllowedCount(): number {
  return MAX_AI_CREATED_OBJECTS_PER_COMMAND;
}
