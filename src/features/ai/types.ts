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

export type BoardCommandResponse = {
  ok: true;
  provider: "stub";
  assistantMessage: string;
  tools: BoardAiTool[];
};

