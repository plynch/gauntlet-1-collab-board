import {
  getSelectedObjects,
  normalizeMessage,
  resolveLayoutTargets,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import { parseGridColumns } from "@/features/ai/commands/deterministic-command-planner-parse-utils";
import {
  MAX_IMPLICIT_LAYOUT_OBJECTS,
  GRID_DEFAULT_COLUMNS,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import {
  isViewportDistributionRequested,
  parseAlignmentMode,
  parseDistributionAxis,
  parseGridGap,
} from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardToolCall } from "@/features/ai/types";

function isArrangeGridCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasArrangeVerb = /\b(arrange|organize|organise|layout|lay\s*out)\b/.test(
    lower,
  );
  const hasGridLanguage = /\bgrid\b/.test(lower) || /\bcolumns?\b/.test(lower);
  return hasArrangeVerb && hasGridLanguage;
}

function isArrangeGridCenterRequested(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(in|at)\s+the\s+(middle|center|centre)\b/.test(lower) ||
    /\b(center|centre)(?:ed)?\b/.test(lower)
  );
}

export function planArrangeGrid(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isArrangeGridCommand(input.message)) {
    return null;
  }
  const resolvedTargets = resolveLayoutTargets(input, 2);
  if (resolvedTargets.tooMany) {
    return {
      planned: false,
      intent: "arrange-grid",
      assistantMessage: `Arrange up to ${MAX_IMPLICIT_LAYOUT_OBJECTS} objects per command.`,
    };
  }
  if (resolvedTargets.objects.length < 2) {
    return {
      planned: false,
      intent: "arrange-grid",
      assistantMessage: "Select two or more objects, then run arrange in grid.",
    };
  }
  const columns = parseGridColumns(input.message) ?? GRID_DEFAULT_COLUMNS;
  const gap = parseGridGap(input.message);
  const centerInViewport = isArrangeGridCenterRequested(input.message);
  const arrangedObjects = resolvedTargets.objects;
  const arrangedCount = arrangedObjects.length;
  const assistantMessage =
    resolvedTargets.source === "selected"
      ? `Arranged ${arrangedCount} selected object${arrangedCount === 1 ? "" : "s"} in a grid.`
      : centerInViewport
        ? `Arranged ${arrangedCount} objects in a centered grid.`
        : `Arranged ${arrangedCount} objects in a grid.`;
  return {
    planned: true,
    intent: "arrange-grid",
    assistantMessage,
    plan: toPlan({
      id: "command.arrange-grid",
      name: "Arrange Selected Objects In Grid",
      operations: [
        {
          tool: "arrangeObjectsInGrid",
          args: {
            objectIds: arrangedObjects.map((objectItem) => objectItem.id),
            columns,
            ...(gap?.gapX !== undefined ? { gapX: gap.gapX } : {}),
            ...(gap?.gapY !== undefined ? { gapY: gap.gapY } : {}),
            ...(centerInViewport ? { centerInViewport: true } : {}),
            ...(centerInViewport && input.viewportBounds
              ? { viewportBounds: input.viewportBounds }
              : {}),
          },
        },
      ],
    }),
  };
}

function isAlignCommand(message: string): boolean {
  return /\balign\b/.test(normalizeMessage(message));
}

export function planAlignSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isAlignCommand(input.message)) {
    return null;
  }
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length < 2) {
    return {
      planned: false,
      intent: "align-objects",
      assistantMessage:
        "Select two or more objects first, then run align selected.",
    };
  }
  const alignment = parseAlignmentMode(input.message);
  if (!alignment) {
    return {
      planned: false,
      intent: "align-objects",
      assistantMessage:
        "Specify alignment direction: left, center, right, top, middle, or bottom.",
    };
  }
  return {
    planned: true,
    intent: "align-objects",
    assistantMessage: `Aligned ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} to ${alignment}.`,
    plan: toPlan({
      id: "command.align-selected",
      name: "Align Selected Objects",
      operations: [
        {
          tool: "alignObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            alignment,
          },
        },
      ],
    }),
  };
}

function isDistributeCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bdistribute\b/.test(lower) ||
    /\bspace\b[\w\s]{0,25}\bevenly\b/.test(lower) ||
    /\bevenly\b[\w\s]{0,25}\bspace\b/.test(lower)
  );
}

export function planDistributeSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isDistributeCommand(input.message)) {
    return null;
  }
  const resolvedTargets = resolveLayoutTargets(input, 3);
  if (resolvedTargets.tooMany) {
    return {
      planned: false,
      intent: "distribute-objects",
      assistantMessage: `Distribute up to ${MAX_IMPLICIT_LAYOUT_OBJECTS} objects per command.`,
    };
  }
  if (resolvedTargets.objects.length < 3) {
    return {
      planned: false,
      intent: "distribute-objects",
      assistantMessage:
        "Select three or more objects first, then run distribute selected.",
    };
  }
  const targetObjects = resolvedTargets.objects;
  const targetCount = targetObjects.length;
  const axis = parseDistributionAxis(input.message);
  const viewportDistributionRequested = isViewportDistributionRequested(
    input.message,
  );
  const shouldUseViewportBounds =
    viewportDistributionRequested && Boolean(input.viewportBounds);
  const operations: BoardToolCall[] = [];
  if (shouldUseViewportBounds) {
    operations.push({
      tool: "alignObjects",
      args: {
        objectIds: targetObjects.map((objectItem) => objectItem.id),
        alignment: axis === "horizontal" ? "middle" : "center",
      },
    });
  }
  operations.push({
    tool: "distributeObjects",
    args: {
      objectIds: targetObjects.map((objectItem) => objectItem.id),
      axis,
      ...(shouldUseViewportBounds && input.viewportBounds
        ? { viewportBounds: input.viewportBounds }
        : {}),
    },
  });
  const assistantMessage = shouldUseViewportBounds
    ? resolvedTargets.source === "selected"
      ? `Spaced ${targetCount} selected object${targetCount === 1 ? "" : "s"} evenly across the screen ${axis === "horizontal" ? "left to right" : "top to bottom"}.`
      : `Spaced ${targetCount} objects evenly across the screen ${axis === "horizontal" ? "left to right" : "top to bottom"}.`
    : resolvedTargets.source === "selected"
      ? `Spaced ${targetCount} selected object${targetCount === 1 ? "" : "s"} evenly ${axis === "horizontal" ? "left to right" : "top to bottom"}.`
      : `Spaced ${targetCount} objects evenly ${axis === "horizontal" ? "left to right" : "top to bottom"}.`;
  return {
    planned: true,
    intent: "distribute-objects",
    assistantMessage,
    plan: toPlan({
      id: "command.distribute-selected",
      name: "Distribute Selected Objects",
      operations,
    }),
  };
}
