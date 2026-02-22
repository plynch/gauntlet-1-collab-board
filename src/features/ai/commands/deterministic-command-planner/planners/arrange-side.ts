import {
  findColor,
  getSelectedObjects,
  normalizeMessage,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import { MAX_MOVE_OBJECTS } from "@/features/ai/commands/deterministic-command-planner-constants";
import { parseSideTarget } from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardObjectSnapshot } from "@/features/ai/types";

type ArrangeTarget =
  | "sticky"
  | "shape"
  | "rect"
  | "circle"
  | "line"
  | "triangle"
  | "star"
  | "frame"
  | "gridContainer";

const SELECTION_REFERENCE_REGEX =
  /\b(selected|selection|these|those|them|elements?|objects?)\b/i;

function isArrangeToSideCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasArrangeVerb =
    /\b(arrange|organize|organise|stack|place|put|position)\b/.test(lower);
  const hasSideTarget = parseSideTarget(message) !== null;
  const hasConflictingLayoutLanguage =
    /\bgrid\b/.test(lower) ||
    /\bcolumns?\b/.test(lower) ||
    /\bdistribute\b/.test(lower) ||
    /\bevenly\b/.test(lower) ||
    /\balign\b/.test(lower);

  return hasArrangeVerb && hasSideTarget && !hasConflictingLayoutLanguage;
}

function parseArrangeTarget(message: string): ArrangeTarget | null {
  const lower = normalizeMessage(message);
  if (/\bsticky\s+notes?\b|\bstick(?:y|ies)\b|\bnotes?\b/.test(lower)) {
    return "sticky";
  }
  if (/\bshapes?\b/.test(lower)) {
    return "shape";
  }
  if (/\brectangles?\b|\brects?\b/.test(lower)) {
    return "rect";
  }
  if (/\bcircles?\b/.test(lower)) {
    return "circle";
  }
  if (/\blines?\b/.test(lower)) {
    return "line";
  }
  if (/\btriangles?\b/.test(lower)) {
    return "triangle";
  }
  if (/\bstars?\b/.test(lower)) {
    return "star";
  }
  if (/\bframes?\b/.test(lower)) {
    return "frame";
  }
  if (/\bcontainers?\b/.test(lower)) {
    return "gridContainer";
  }
  return null;
}

function matchesArrangeTarget(
  objectItem: BoardObjectSnapshot,
  target: ArrangeTarget,
): boolean {
  if (target === "shape") {
    return (
      objectItem.type === "rect" ||
      objectItem.type === "circle" ||
      objectItem.type === "line" ||
      objectItem.type === "triangle" ||
      objectItem.type === "star"
    );
  }

  return objectItem.type === target;
}

export function planArrangeToSide(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isArrangeToSideCommand(input.message)) {
    return null;
  }
  const sideTarget = parseSideTarget(input.message);
  if (!sideTarget) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  const target = parseArrangeTarget(input.message);
  const colorFilter = findColor(input.message)?.toLowerCase();
  const messageReferencesSelection = SELECTION_REFERENCE_REGEX.test(input.message);

  let candidates: BoardObjectSnapshot[] = [];
  if (target) {
    candidates = input.boardState.filter((objectItem) =>
      matchesArrangeTarget(objectItem, target),
    );
    if (colorFilter) {
      candidates = candidates.filter(
        (objectItem) => objectItem.color.toLowerCase() === colorFilter,
      );
    }
  } else if (selectedObjects.length > 0) {
    candidates = selectedObjects;
  } else if (messageReferencesSelection) {
    return {
      planned: false,
      intent: "arrange-to-side",
      assistantMessage:
        "Select one or more objects first, then run the arrange command again.",
    };
  } else {
    return null;
  }

  if (candidates.length === 0) {
    return {
      planned: false,
      intent: "arrange-to-side",
      assistantMessage: "No matching objects found to arrange.",
    };
  }
  if (candidates.length > MAX_MOVE_OBJECTS) {
    return {
      planned: false,
      intent: "arrange-to-side",
      assistantMessage: `Arrange up to ${MAX_MOVE_OBJECTS} objects per command.`,
    };
  }

  return {
    planned: true,
    intent: "arrange-to-side",
    assistantMessage: `Arranged ${candidates.length} object${candidates.length === 1 ? "" : "s"} on the ${sideTarget} side.`,
    plan: toPlan({
      id: "command.arrange-to-side",
      name: "Arrange Objects To Viewport Side",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: candidates.map((objectItem) => objectItem.id),
            toViewportSide: {
              side: sideTarget,
              ...(input.viewportBounds
                ? { viewportBounds: input.viewportBounds }
                : {}),
            },
          },
        },
      ],
    }),
  };
}
