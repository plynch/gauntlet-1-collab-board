import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setOpenAiClientForTests } from "@/features/ai/openai/openai-client";
import { runBoardCommandWithOpenAiAgents } from "@/features/ai/openai/agents/openai-agents-runner";

const {
  runMock,
  runnerCtorMock,
  createBoardAgentToolsMock,
  setDefaultOpenAIClientMock,
  extractAllTextOutputMock,
} = vi.hoisted(() => {
  const runMock = vi.fn();
  return {
    runMock,
    runnerCtorMock: vi.fn((config: unknown) => config),
    createBoardAgentToolsMock: vi.fn(),
    setDefaultOpenAIClientMock: vi.fn(),
    extractAllTextOutputMock: vi.fn(() => ""),
  };
});

vi.mock("@openai/agents", () => ({
  Agent: class {
    constructor(config: unknown) {
      Object.assign(this, config);
    }
  },
  Runner: class {
    run = runMock;

    constructor(config: unknown) {
      runnerCtorMock(config);
    }
  },
  setDefaultOpenAIClient: setDefaultOpenAIClientMock,
  extractAllTextOutput: extractAllTextOutputMock,
}));

vi.mock("@/features/ai/openai/agents/board-agent-tools", () => ({
  createBoardAgentTools: createBoardAgentToolsMock,
}));

const originalAiEnableOpenAi = process.env.AI_ENABLE_OPENAI;
const originalAiPlannerMode = process.env.AI_PLANNER_MODE;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalOpenAiRuntime = process.env.OPENAI_RUNTIME;
const originalOpenAiAgentsTracingApiKey =
  process.env.OPENAI_AGENTS_TRACING_API_KEY;

beforeEach(() => {
  process.env.AI_ENABLE_OPENAI = "true";
  process.env.AI_PLANNER_MODE = "openai-strict";
  process.env.OPENAI_API_KEY = "test-openai-key";
  process.env.OPENAI_RUNTIME = "agents-sdk";
  process.env.OPENAI_AGENTS_TRACING_API_KEY = "test-openai-tracing-key";
  runMock.mockReset();
  runnerCtorMock.mockClear();
  createBoardAgentToolsMock.mockReset();
  setDefaultOpenAIClientMock.mockClear();
  extractAllTextOutputMock.mockReturnValue("");
  setOpenAiClientForTests({} as never);
});

afterEach(() => {
  setOpenAiClientForTests(undefined);

  if (originalAiEnableOpenAi === undefined) {
    delete process.env.AI_ENABLE_OPENAI;
  } else {
    process.env.AI_ENABLE_OPENAI = originalAiEnableOpenAi;
  }
  if (originalAiPlannerMode === undefined) {
    delete process.env.AI_PLANNER_MODE;
  } else {
    process.env.AI_PLANNER_MODE = originalAiPlannerMode;
  }
  if (originalOpenAiApiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiApiKey;
  }
  if (originalOpenAiRuntime === undefined) {
    delete process.env.OPENAI_RUNTIME;
  } else {
    process.env.OPENAI_RUNTIME = originalOpenAiRuntime;
  }
  if (originalOpenAiAgentsTracingApiKey === undefined) {
    delete process.env.OPENAI_AGENTS_TRACING_API_KEY;
  } else {
    process.env.OPENAI_AGENTS_TRACING_API_KEY =
      originalOpenAiAgentsTracingApiKey;
  }
});

describe("runBoardCommandWithOpenAiAgents", () => {
  it("returns planned success with tool execution snapshot", async () => {
    createBoardAgentToolsMock.mockReturnValue({
      tools: [],
      getExecutionSnapshot: () => ({
        operationsExecuted: [
          {
            tool: "createStickyNote",
            args: {
              text: "Hello",
              x: 120,
              y: 160,
              color: "#fde68a",
            },
          },
        ],
        results: [{ tool: "createStickyNote", objectId: "sticky-1" }],
        createdObjectIds: ["sticky-1"],
        deletedCount: 0,
        toolCalls: 1,
      }),
    });
    runMock.mockResolvedValue({
      finalOutput: {
        intent: "create-sticky",
        planned: true,
        assistantMessage: "Created sticky note.",
      },
      newItems: [],
      lastResponseId: "resp_123",
      state: {
        usage: {
          inputTokens: 120,
          outputTokens: 48,
        },
      },
    });

    const result = await runBoardCommandWithOpenAiAgents({
      message: "Create a sticky",
      boardId: "board-1",
      userId: "user-1",
      boardState: [],
      selectedObjectIds: [],
      viewportBounds: null,
      executor: {} as never,
      trace: {
        traceId: "lf-trace-1",
      } as never,
    });

    expect(result.planned).toBe(true);
    expect(result.intent).toBe("create-sticky");
    expect(result.operationsExecuted).toHaveLength(1);
    expect(result.toolCalls).toBe(1);
    expect(result.responseId).toBe("resp_123");
    expect(result.usage.totalTokens).toBe(168);
    expect(setDefaultOpenAIClientMock).toHaveBeenCalledTimes(1);
    expect(runnerCtorMock).toHaveBeenCalledTimes(1);
    expect(runnerCtorMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tracingDisabled: false,
        workflowName: "collabboard-command",
        traceMetadata: {
          langfuseTraceId: "lf-trace-1",
          boardId: "board-1",
          userId: "user-1",
          plannerMode: "openai-strict",
          runtimeBackend: "agents-sdk",
        },
      }),
    );
    expect(runMock).toHaveBeenCalledWith(
      expect.any(Object),
      expect.stringContaining("Create a sticky"),
      expect.objectContaining({
        maxTurns: 8,
        tracing: {
          apiKey: "test-openai-tracing-key",
        },
      }),
    );
  });

  it("returns not-planned when final output is planned=false", async () => {
    createBoardAgentToolsMock.mockReturnValue({
      tools: [],
      getExecutionSnapshot: () => ({
        operationsExecuted: [],
        results: [],
        createdObjectIds: [],
        deletedCount: 0,
        toolCalls: 0,
      }),
    });
    runMock.mockResolvedValue({
      finalOutput: {
        intent: "unsupported-command",
        planned: false,
        assistantMessage: "I could not map that command.",
      },
      newItems: [],
      lastResponseId: "resp_456",
      state: {
        usage: {
          inputTokens: 80,
          outputTokens: 20,
        },
      },
    });

    const result = await runBoardCommandWithOpenAiAgents({
      message: "Do something unsupported",
      boardId: "board-1",
      userId: "user-1",
      boardState: [],
      selectedObjectIds: [],
      viewportBounds: null,
      executor: {} as never,
      trace: {
        traceId: "lf-trace-2",
      } as never,
    });

    expect(result.planned).toBe(false);
    expect(result.intent).toBe("unsupported-command");
    expect(result.assistantMessage).toContain("could not map");
  });

  it("throws when final output says planned=true but no mutating operations ran", async () => {
    createBoardAgentToolsMock.mockReturnValue({
      tools: [],
      getExecutionSnapshot: () => ({
        operationsExecuted: [],
        results: [],
        createdObjectIds: [],
        deletedCount: 0,
        toolCalls: 0,
      }),
    });
    runMock.mockResolvedValue({
      finalOutput: {
        intent: "create-sticky",
        planned: true,
        assistantMessage: "Created sticky.",
      },
      newItems: [],
      lastResponseId: "resp_999",
      state: {
        usage: {
          inputTokens: 90,
          outputTokens: 32,
        },
      },
    });

    await expect(
      runBoardCommandWithOpenAiAgents({
        message: "Create sticky",
        boardId: "board-1",
        userId: "user-1",
        boardState: [],
        selectedObjectIds: [],
        viewportBounds: null,
        executor: {} as never,
        trace: {
          traceId: "lf-trace-3",
        } as never,
      }),
    ).rejects.toThrow(/planned=true but executed no mutating tool calls/i);
  });
});
