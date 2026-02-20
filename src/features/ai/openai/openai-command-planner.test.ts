import { describe, expect, it } from "vitest";

import { parseOpenAiPlannerOutput } from "@/features/ai/openai/openai-command-planner";

describe("parseOpenAiPlannerOutput", () => {
  it("accepts valid planned output", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "create-sticky",
        planned: true,
        assistantMessage: "Created sticky note.",
        operations: [
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
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toHaveLength(1);
  });

  it("accepts createShape output with line type", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "create-line",
        planned: true,
        assistantMessage: "Created line.",
        operations: [
          {
            tool: "createShape",
            args: {
              type: "line",
              x: 120,
              y: 160,
              width: 220,
              height: 24,
              color: "#94a3b8",
            },
          },
        ],
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations[0]).toEqual({
      tool: "createShape",
      args: {
        type: "line",
        x: 120,
        y: 160,
        width: 220,
        height: 24,
        color: "#94a3b8",
      },
    });
  });

  it("rejects planned output with empty operations", () => {
    expect(() =>
      parseOpenAiPlannerOutput(
        JSON.stringify({
          intent: "unsupported",
          planned: true,
          assistantMessage: "Could not map",
          operations: [],
        }),
      ),
    ).toThrow();
  });

  it("accepts non-planned output without operations", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "unsupported",
        planned: false,
        assistantMessage: "Select objects first.",
      }),
    );

    expect(parsed.planned).toBe(false);
    expect(parsed.operations).toEqual([]);
  });
});
