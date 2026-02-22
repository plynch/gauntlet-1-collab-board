import { describe, expect, it } from "vitest";
import type { Serialized } from "@langchain/core/load/serializable";

import type { AiTraceRun } from "@/features/ai/observability/trace-run";
import { LangChainLangfuseCallbackHandler } from "@/features/ai/observability/langchain-langfuse-handler";

type RecordedSpan = {
  name: string;
  input: Record<string, unknown>;
  endPayload?: Record<string, unknown>;
  failPayload?: {
    message: string;
    details?: Record<string, unknown>;
  };
};

function createFakeTraceRun(records: RecordedSpan[]): AiTraceRun {
  return {
    traceId: "trace-test-1",
    startSpan: (name, input = {}) => {
      const record: RecordedSpan = {
        name,
        input,
      };
      records.push(record);
      return {
        end: (payload = {}) => {
          record.endPayload = payload;
        },
        fail: (message, details) => {
          record.failPayload = {
            message,
            details,
          };
        },
      };
    },
    updateMetadata: () => {
      // no-op for tests
    },
    finishSuccess: () => {
      // no-op for tests
    },
    finishError: () => {
      // no-op for tests
    },
  };
}

const SERIALIZED_CHAIN: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["collabboard", "chain", "tool-plan"],
};

const SERIALIZED_TOOL: Serialized = {
  lc: 1,
  type: "not_implemented",
  id: ["collabboard", "tool", "createStickyNote"],
};

describe("LangChainLangfuseCallbackHandler", () => {
  it("maps chain/tool start+end callbacks to trace spans", () => {
    const records: RecordedSpan[] = [];
    const handler = new LangChainLangfuseCallbackHandler(
      createFakeTraceRun(records),
    );

    handler.handleChainStart(
      SERIALIZED_CHAIN,
      { operationCount: 2 },
      "chain-run-1",
      undefined,
      ["langchain"],
      { traceId: "trace-test-1" },
      "chain",
      "tool.execute",
    );
    handler.handleToolStart(
      SERIALIZED_TOOL,
      JSON.stringify({ text: "hello" }),
      "tool-run-1",
      "chain-run-1",
      ["board-tool-call"],
      { operationIndex: 0 },
      "createStickyNote",
    );
    handler.handleToolEnd(
      {
        objectId: "obj-1",
      },
      "tool-run-1",
    );
    handler.handleChainEnd(
      {
        toolCalls: 1,
      },
      "chain-run-1",
    );

    expect(records).toHaveLength(2);
    expect(records[0].name).toBe("tool.execute");
    expect(records[0].endPayload?.langchain).toBe(true);
    expect(records[1].name).toBe("tool.execute.call");
    expect(records[1].endPayload?.langchain).toBe(true);
    expect(records[1].input.tool).toBe("createStickyNote");
  });

  it("maps chain/tool errors to failed spans", () => {
    const records: RecordedSpan[] = [];
    const handler = new LangChainLangfuseCallbackHandler(
      createFakeTraceRun(records),
    );

    handler.handleChainStart(
      SERIALIZED_CHAIN,
      { operationCount: 1 },
      "chain-run-2",
    );
    handler.handleToolStart(
      SERIALIZED_TOOL,
      JSON.stringify({ text: "hello" }),
      "tool-run-2",
      "chain-run-2",
    );

    handler.handleToolError(new Error("Tool failure"), "tool-run-2");
    handler.handleChainError(new Error("Chain failure"), "chain-run-2");

    expect(records).toHaveLength(2);
    expect(records[1].failPayload?.message).toContain("Tool failure");
    expect(records[0].failPayload?.message).toContain("Chain failure");
  });
});
