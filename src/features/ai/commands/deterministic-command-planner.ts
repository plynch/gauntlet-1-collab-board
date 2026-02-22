import { planExtractActionItems, planSummarizeSource } from "@/features/ai/commands/deterministic-command-planner/planners/analysis";
import {
  planCreateFrame,
  planCreateShape,
  planCreateSticky,
  planCreateStickyBatch,
} from "@/features/ai/commands/deterministic-command-planner/planners/create";
import {
  planChangeColorSelected,
  planResizeSelected,
  planUpdateSelectedText,
} from "@/features/ai/commands/deterministic-command-planner/planners/edit";
import {
  planAlignSelected,
  planArrangeGrid,
  planDistributeSelected,
} from "@/features/ai/commands/deterministic-command-planner/planners/layout";
import { planArrangeToSide } from "@/features/ai/commands/deterministic-command-planner/planners/arrange-side";
import {
  planFitFrameToContents,
  planMoveAll,
  planMoveSelected,
} from "@/features/ai/commands/deterministic-command-planner/planners/move";
import {
  planClearBoard,
  planDeleteSelected,
  planSelectAllObjects,
  planSelectVisibleObjects,
  planUnselectObjects,
} from "@/features/ai/commands/deterministic-command-planner/planners/selection";
import { planAddSwotSectionItem } from "@/features/ai/commands/deterministic-command-planner/planners/swot-item";
import {
  planCreateJourneyMap,
  planCreateRetrospectiveBoard,
  planCreateStickyGrid,
  planCreateSwotTemplate,
} from "@/features/ai/commands/deterministic-command-planner/planners/templates";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import type {
  DeterministicCommandPlanResult,
  DeterministicPlanner,
} from "@/features/ai/commands/deterministic-command-planner-result";

export type { DeterministicCommandPlanResult } from "@/features/ai/commands/deterministic-command-planner-result";

const DETERMINISTIC_PLANNERS: DeterministicPlanner[] = [
  planClearBoard,
  planUnselectObjects,
  planSelectAllObjects,
  planSelectVisibleObjects,
  planDeleteSelected,
  planArrangeToSide,
  planArrangeGrid,
  planAlignSelected,
  planDistributeSelected,
  planSummarizeSource,
  planExtractActionItems,
  planCreateStickyGrid,
  planCreateSwotTemplate,
  planAddSwotSectionItem,
  planCreateJourneyMap,
  planCreateRetrospectiveBoard,
  planCreateStickyBatch,
  planCreateSticky,
  planCreateFrame,
  planCreateShape,
  planMoveSelected,
  planMoveAll,
  planFitFrameToContents,
  planResizeSelected,
  planChangeColorSelected,
  planUpdateSelectedText,
];

export function planDeterministicCommand(
  input: PlannerInput,
): DeterministicCommandPlanResult {
  for (const planner of DETERMINISTIC_PLANNERS) {
    const result = planner(input);
    if (result) {
      return result;
    }
  }

  return {
    planned: false,
    intent: "unsupported-command",
    assistantMessage:
      "I could not map that command yet. Try creating stickies/shapes/frames, adding SWOT items (strength/weakness/opportunity/threat), arranging or aligning or distributing selected objects, moving object groups, resizing selected or fitting a frame to contents, summarizing notes, extracting action items, deleting selected, clearing the board, changing selected color, or creating SWOT, retrospective, and journey-map templates.",
  };
}
