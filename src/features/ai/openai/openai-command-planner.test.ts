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

  it("accepts valid output wrapped in markdown code fences", () => {
    const parsed = parseOpenAiPlannerOutput(
      [
        "```json",
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
        "```",
      ].join("\n"),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toHaveLength(1);
  });

  it("accepts align/distribute operations", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "layout-pack",
        planned: true,
        assistantMessage: "Aligned and distributed selection.",
        operations: [
          {
            tool: "alignObjects",
            args: {
              objectIds: ["obj-1", "obj-2", "obj-3"],
              alignment: "left",
            },
          },
          {
            tool: "distributeObjects",
            args: {
              objectIds: ["obj-1", "obj-2", "obj-3"],
              axis: "horizontal",
            },
          },
        ],
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toHaveLength(2);
    expect(parsed.operations[0]?.tool).toBe("alignObjects");
    expect(parsed.operations[1]?.tool).toBe("distributeObjects");
  });

  it("normalizes sticky aliases and alternate arg fields", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "create-sticky",
        planned: true,
        assistantMessage: "Created sticky note.",
        operations: [
          {
            tool: "createSticky",
            parameters: {
              content: "Hello from alias",
              position: { x: 140, y: 180 },
              colour: "yellow",
            },
          },
        ],
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toEqual([
      {
        tool: "createStickyNote",
        args: {
          text: "Hello from alias",
          x: 140,
          y: 180,
          color: "yellow",
        },
      },
    ]);
  });

  it("normalizes line tool aliases into createShape line", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "create-line",
        planned: true,
        assistantMessage: "Created line shape.",
        operations: [
          {
            tool: "createLine",
            payload: {
              position: { x: 220, y: 220 },
              size: { width: 260, height: 24 },
              color: "gray",
            },
          },
        ],
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toEqual([
      {
        tool: "createShape",
        args: {
          type: "line",
          x: 220,
          y: 220,
          width: 260,
          height: 24,
          color: "gray",
        },
      },
    ]);
  });

  it("normalizes function-call shaped operations", () => {
    const parsed = parseOpenAiPlannerOutput(
      JSON.stringify({
        intent: "create-sticky",
        planned: true,
        assistantMessage: "Created sticky note.",
        toolCalls: [
          {
            function: {
              name: "createStickyNote",
              arguments: JSON.stringify({
                text: "From function call",
                x: 200,
                y: 210,
                color: "#fde68a",
              }),
            },
          },
        ],
      }),
    );

    expect(parsed.planned).toBe(true);
    expect(parsed.operations).toEqual([
      {
        tool: "createStickyNote",
        args: {
          text: "From function call",
          x: 200,
          y: 210,
          color: "#fde68a",
        },
      },
    ]);
  });
});
