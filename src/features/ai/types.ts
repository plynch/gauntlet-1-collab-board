import type {
  BoardBounds,
  BoardToolCall,
} from "@/features/ai/types/board-domain-types";

export type BoardAiTool = {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
};

export type BoardCommandRequest = {
  boardId: string;
  message: string;
  selectedObjectIds?: string[];
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
};

export type {
  BoardBounds,
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  ViewportBounds,
} from "@/features/ai/types/board-domain-types";

export type TemplatePlan = {
  templateId: string;
  templateName: string;
  operations: BoardToolCall[];
  metadata?: Record<string, unknown>;
};

export type TemplateInstantiateInput = {
  templateId: string;
  boardBounds: BoardBounds | null;
  selectedObjectIds: string[];
  existingObjectCount: number;
  viewportBounds?: {
    left: number;
    top: number;
    width: number;
    height: number;
  } | null;
};

export type TemplateInstantiateOutput = {
  plan: TemplatePlan;
};

export type BoardCommandExecutionSummary = {
  intent: string;
  mode: "deterministic" | "stub" | "llm";
  mcpUsed: boolean;
  fallbackUsed: boolean;
  toolCalls: number;
  objectsCreated: number;
  openAi?: {
    attempted: boolean;
    status:
      | "disabled"
      | "budget-blocked"
      | "policy-blocked"
      | "planned"
      | "not-planned"
      | "error";
    model: string;
    runtime?: "agents-sdk" | "chat-completions";
    traceId?: string;
    estimatedCostUsd: number;
    totalSpentUsd?: number;
  };
};

export type BoardSelectionUpdate = {
  mode: "clear" | "replace";
  objectIds: string[];
};

export type BoardCommandResponse = {
  ok: true;
  provider: "stub" | "deterministic-mcp" | "openai";
  assistantMessage: string;
  tools: BoardAiTool[];
  mode?: "deterministic" | "stub" | "llm";
  traceId?: string;
  execution?: BoardCommandExecutionSummary;
  selectionUpdate?: BoardSelectionUpdate;
};
