import {
  getIntersectionBounds,
  getSelectedObjects,
  normalizeMessage,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";

function isClearBoardCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bclear(?:\s+the)?\s+board\b/.test(lower) ||
    /\bclear\s+all(?:\s+objects?)?(?:\s+on\s+the\s+board)?\b/.test(lower) ||
    /\bdelete\s+all\s+shapes\b/.test(lower) ||
    /\bremove\s+all\s+shapes\b/.test(lower) ||
    /\b(?:delete|remove)\s+everything(?:\s+on\s+the\s+board)?\b/.test(lower) ||
    /\bwipe\s+the\s+board\b/.test(lower)
  );
}

function isUnselectCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bunselect\b/.test(lower) ||
    /\bdeselect\b/.test(lower) ||
    /\bclear\s+selection\b/.test(lower) ||
    /\bclear\s+selected\b/.test(lower) ||
    /\bclear\s+objects\b/.test(lower)
  );
}

export function planUnselectObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isUnselectCommand(input.message)) {
    return null;
  }
  return {
    planned: true,
    intent: "unselect",
    assistantMessage: "Selection cleared.",
    plan: toPlan({
      id: "command.unselect",
      name: "Unselect Objects",
      operations: [],
    }),
    selectionUpdate: { mode: "clear", objectIds: [] },
  };
}

function isSelectAllCommand(message: string): boolean {
  return /\bselect\s+(all|everything)\b/.test(normalizeMessage(message));
}

function isSelectVisibleCommand(message: string): boolean {
  return /\bselect\s+visible\b/.test(normalizeMessage(message));
}

export function planSelectAllObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSelectAllCommand(input.message)) {
    return null;
  }
  if (input.boardState.length === 0) {
    return {
      planned: true,
      intent: "select-all",
      assistantMessage: "No objects on board to select.",
      plan: toPlan({
        id: "command.select-all",
        name: "Select All Objects",
        operations: [],
      }),
      selectionUpdate: { mode: "replace", objectIds: [] },
    };
  }
  return {
    planned: true,
    intent: "select-all",
    assistantMessage: `Selected ${input.boardState.length} object${input.boardState.length === 1 ? "" : "s"} on the board.`,
    plan: toPlan({
      id: "command.select-all",
      name: "Select All Objects",
      operations: [],
    }),
    selectionUpdate: {
      mode: "replace",
      objectIds: input.boardState.map((objectItem) => objectItem.id),
    },
  };
}

export function planSelectVisibleObjects(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isSelectVisibleCommand(input.message)) {
    return null;
  }
  if (!input.viewportBounds) {
    return {
      planned: true,
      intent: "select-visible",
      assistantMessage:
        "No viewport information was provided, so I could not resolve visible selection.",
      plan: toPlan({
        id: "command.select-visible",
        name: "Select Visible Objects",
        operations: [],
      }),
      selectionUpdate: { mode: "replace", objectIds: [] },
    };
  }
  const visibleObjectIds = input.boardState
    .filter((objectItem) => getIntersectionBounds(objectItem, input.viewportBounds!))
    .map((objectItem) => objectItem.id);
  if (visibleObjectIds.length === 0) {
    return {
      planned: true,
      intent: "select-visible",
      assistantMessage: "No visible objects to select in the current viewport.",
      plan: toPlan({
        id: "command.select-visible",
        name: "Select Visible Objects",
        operations: [],
      }),
      selectionUpdate: { mode: "replace", objectIds: [] },
    };
  }
  return {
    planned: true,
    intent: "select-visible",
    assistantMessage: `Selected ${visibleObjectIds.length} visible object${visibleObjectIds.length === 1 ? "" : "s"} in view.`,
    plan: toPlan({
      id: "command.select-visible",
      name: "Select Visible Objects",
      operations: [],
    }),
    selectionUpdate: { mode: "replace", objectIds: visibleObjectIds },
  };
}

function isDeleteSelectedCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(delete|remove)\b[\w\s]*\bselected\b/.test(lower) ||
    /\bdelete\s+selection\b/.test(lower) ||
    /\bremove\s+selection\b/.test(lower)
  );
}

export function planDeleteSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isDeleteSelectedCommand(input.message)) {
    return null;
  }
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "delete-selected",
      assistantMessage:
        "Select one or more objects first, then run delete selected.",
    };
  }
  return {
    planned: true,
    intent: "delete-selected",
    assistantMessage: `Deleted ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.delete-selected",
      name: "Delete Selected Objects",
      operations: [
        {
          tool: "deleteObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
          },
        },
      ],
    }),
  };
}

export function planClearBoard(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isClearBoardCommand(input.message)) {
    return null;
  }
  if (input.boardState.length === 0) {
    return {
      planned: false,
      intent: "clear-board-empty",
      assistantMessage: "Board is already empty.",
    };
  }
  return {
    planned: true,
    intent: "clear-board",
    assistantMessage: `Cleared board and deleted ${input.boardState.length} object${input.boardState.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.clear-board",
      name: "Clear Board",
      operations: [
        {
          tool: "deleteObjects",
          args: {
            objectIds: input.boardState.map((objectItem) => objectItem.id),
          },
        },
      ],
    }),
  };
}
