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
};

export type BoardObjectToolKind =
  | "sticky"
  | "rect"
  | "circle"
  | "line"
  | "connectorUndirected"
  | "connectorArrow"
  | "connectorBidirectional"
  | "triangle"
  | "star";

export type BoardObjectSnapshot = {
  id: string;
  type: BoardObjectToolKind;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
  updatedAt: string | null;
};

export type BoardBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
};

export type BoardToolCall =
  | {
      tool: "createStickyNote";
      args: {
        text: string;
        x: number;
        y: number;
        color: string;
      };
    }
  | {
      tool: "createShape";
      args: {
        type: BoardObjectToolKind;
        x: number;
        y: number;
        width: number;
        height: number;
        color: string;
      };
    }
  | {
      tool: "createFrame";
      args: {
        title: string;
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }
  | {
      tool: "createConnector";
      args: {
        fromId: string;
        toId: string;
        style: "undirected" | "one-way-arrow" | "two-way-arrow";
      };
    }
  | {
      tool: "moveObject";
      args: {
        objectId: string;
        x: number;
        y: number;
      };
    }
  | {
      tool: "resizeObject";
      args: {
        objectId: string;
        width: number;
        height: number;
      };
    }
  | {
      tool: "updateText";
      args: {
        objectId: string;
        newText: string;
      };
    }
  | {
      tool: "changeColor";
      args: {
        objectId: string;
        color: string;
      };
    }
  | {
      tool: "deleteObjects";
      args: {
        objectIds: string[];
      };
    }
  | {
      tool: "getBoardState";
      args?: Record<string, never>;
    };

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
};

export type TemplateInstantiateOutput = {
  plan: TemplatePlan;
};

export type BoardCommandExecutionSummary = {
  intent: string;
  mode: "deterministic" | "stub";
  mcpUsed: boolean;
  fallbackUsed: boolean;
  toolCalls: number;
  objectsCreated: number;
};

export type BoardCommandResponse = {
  ok: true;
  provider: "stub" | "deterministic-mcp";
  assistantMessage: string;
  tools: BoardAiTool[];
  mode?: "deterministic" | "stub";
  traceId?: string;
  execution?: BoardCommandExecutionSummary;
};
