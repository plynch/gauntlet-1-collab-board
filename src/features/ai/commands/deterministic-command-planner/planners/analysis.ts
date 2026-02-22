import {
  getAnalysisSource,
  normalizeMessage,
  parseActionItemCandidates,
  toTextSnippet,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import { getAutoSpawnPoint } from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import {
  ACTION_ITEM_COLOR,
  ACTION_ITEM_GRID_COLUMNS,
  ACTION_ITEM_SPACING_X,
  ACTION_ITEM_SPACING_Y,
  MAX_SUMMARY_BULLETS,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardToolCall } from "@/features/ai/types";

function isSummarizeCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(summarize|summarise|summary|recap)\b/.test(lower) &&
    !/\b(action items?|next steps?|todo|to-do)\b/.test(lower)
  );
}

export function planSummarizeSource(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSummarizeCommand(input.message)) {
    return null;
  }
  const analysis = getAnalysisSource(input);
  if (analysis.sourceObjects.length === 0) {
    return {
      planned: false,
      intent: "summarize-selected",
      assistantMessage:
        "Select one or more text objects first, or say summarize the board.",
    };
  }
  const bullets = analysis.sourceObjects
    .slice(0, MAX_SUMMARY_BULLETS)
    .map((objectItem) => `- ${toTextSnippet(objectItem.text, 120)}`);
  const heading =
    analysis.scope === "selected"
      ? `Summary of selected notes (${analysis.sourceObjects.length}):`
      : `Summary of board notes (${analysis.sourceObjects.length}):`;
  const assistantMessage = [heading, ...bullets].join("\n").slice(0, 1_000);
  return {
    planned: false,
    intent: "summarize-selected",
    assistantMessage,
  };
}

function isActionItemExtractionCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasActionLanguage = /\b(action items?|next steps?|todo|to-do)\b/.test(lower);
  const hasExtractionLanguage =
    /\b(extract|generate|create|make|convert|turn)\b/.test(lower);
  return hasActionLanguage && hasExtractionLanguage;
}

export function planExtractActionItems(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isActionItemExtractionCommand(input.message)) {
    return null;
  }
  const analysis = getAnalysisSource(input);
  if (analysis.sourceObjects.length === 0) {
    return {
      planned: false,
      intent: "extract-action-items",
      assistantMessage:
        "Select one or more text objects first, or say create action items for the board.",
    };
  }
  const candidates = parseActionItemCandidates(analysis.sourceObjects);
  if (candidates.length === 0) {
    return {
      planned: false,
      intent: "extract-action-items",
      assistantMessage:
        "I could not find clear action-item text. Try selecting notes with concrete tasks.",
    };
  }
  const spawnPoint = getAutoSpawnPoint(input.boardState);
  const columns = Math.min(ACTION_ITEM_GRID_COLUMNS, candidates.length);
  const operations: BoardToolCall[] = candidates.map((candidate, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    return {
      tool: "createStickyNote",
      args: {
        text: `Action ${index + 1}: ${toTextSnippet(candidate, 110)}`.slice(0, 1_000),
        x: spawnPoint.x + column * ACTION_ITEM_SPACING_X,
        y: spawnPoint.y + row * ACTION_ITEM_SPACING_Y,
        color: ACTION_ITEM_COLOR,
      },
    };
  });
  return {
    planned: true,
    intent: "extract-action-items",
    assistantMessage: `Created ${operations.length} action-item sticky notes from ${analysis.scope === "selected" ? "selected notes" : "board notes"}.`,
    plan: toPlan({
      id: "command.extract-action-items",
      name: "Extract Action Items",
      operations,
    }),
  };
}
