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

export type BoardObjectToolKind =
  | "sticky"
  | "rect"
  | "circle"
  | "gridContainer"
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
  gridRows?: number | null;
  gridCols?: number | null;
  gridGap?: number | null;
  gridCellColors?: string[] | null;
  containerTitle?: string | null;
  gridSectionTitles?: string[] | null;
  gridSectionNotes?: string[] | null;
  containerId?: string | null;
  containerSectionIndex?: number | null;
  containerRelX?: number | null;
  containerRelY?: number | null;
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

export type ViewportBounds = {
  left: number;
  top: number;
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
      tool: "createShapeBatch";
      args: {
        count: number;
        type: "rect" | "circle" | "line" | "triangle" | "star";
        originX: number;
        originY: number;
        width?: number;
        height?: number;
        color?: string;
        colors?: string[];
        columns?: number;
        gapX?: number;
        gapY?: number;
      };
    }
  | {
      tool: "createStickyBatch";
      args: {
        count: number;
        color: string;
        originX: number;
        originY: number;
        columns?: number;
        gapX?: number;
        gapY?: number;
        textPrefix?: string;
      };
    }
  | {
      tool: "createGridContainer";
      args: {
        x: number;
        y: number;
        width: number;
        height: number;
        rows: number;
        cols: number;
        gap: number;
        cellColors?: string[];
        containerTitle?: string;
        sectionTitles?: string[];
        sectionNotes?: string[];
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
      tool: "arrangeObjectsInGrid";
      args: {
        objectIds: string[];
        columns: number;
        gapX?: number;
        gapY?: number;
        originX?: number;
        originY?: number;
        viewportBounds?: ViewportBounds;
        centerInViewport?: boolean;
      };
    }
  | {
      tool: "alignObjects";
      args: {
        objectIds: string[];
        alignment:
          | "left"
          | "center"
          | "right"
          | "top"
          | "middle"
          | "bottom";
      };
    }
  | {
      tool: "distributeObjects";
      args: {
        objectIds: string[];
        axis: "horizontal" | "vertical";
        viewportBounds?: ViewportBounds;
      };
    }
  | {
      tool: "moveObjects";
      args: {
        objectIds: string[];
        delta?: {
          dx: number;
          dy: number;
        };
        toPoint?: {
          x: number;
          y: number;
        };
        toViewportSide?: {
          side: "left" | "right" | "top" | "bottom";
          viewportBounds?: ViewportBounds;
          padding?: number;
        };
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
      tool: "fitFrameToContents";
      args: {
        frameId: string;
        padding?: number;
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
