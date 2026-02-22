import {
  findColor,
  getSelectedObjects,
  normalizeMessage,
  parseCoordinatePoint,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import {
  MAX_MOVE_OBJECTS,
  DEFAULT_FRAME_FIT_PADDING,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import {
  parseDirectionDelta,
  parseSideTarget,
} from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import { parsePadding } from "@/features/ai/commands/deterministic-command-planner-parse-utils";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardObjectToolKind } from "@/features/ai/types";

export function planMoveSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower) || !/\bselected\b/.test(lower)) {
    return null;
  }
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage:
        "Select one or more objects first, then run the move command again.",
    };
  }
  if (selectedObjects.length > MAX_MOVE_OBJECTS) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage: `Move up to ${MAX_MOVE_OBJECTS} selected objects per command.`,
    };
  }
  const targetPoint = parseCoordinatePoint(input.message);
  const sideTarget = parseSideTarget(input.message);
  if (targetPoint) {
    return {
      planned: true,
      intent: "move-selected",
      assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
      plan: toPlan({
        id: "command.move-selected",
        name: "Move Selected Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: selectedObjects.map((objectItem) => objectItem.id),
              toPoint: targetPoint,
            },
          },
        ],
      }),
    };
  }
  if (sideTarget) {
    return {
      planned: true,
      intent: "move-selected",
      assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"} to ${sideTarget} side.`,
      plan: toPlan({
        id: "command.move-selected",
        name: "Move Selected Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: selectedObjects.map((objectItem) => objectItem.id),
              toViewportSide: {
                side: sideTarget,
                ...(input.viewportBounds ? { viewportBounds: input.viewportBounds } : {}),
              },
            },
          },
        ],
      }),
    };
  }
  const delta = parseDirectionDelta(input.message);
  if (!delta) {
    return {
      planned: false,
      intent: "move-selected",
      assistantMessage:
        "Specify where to move selected objects, for example: right by 120, or to 400, 300.",
    };
  }
  return {
    planned: true,
    intent: "move-selected",
    assistantMessage: `Moved ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-selected",
      name: "Move Selected Objects",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: selectedObjects.map((objectItem) => objectItem.id),
            delta: { dx: delta.x, dy: delta.y },
          },
        },
      ],
    }),
  };
}

function parseMoveAllType(message: string): BoardObjectToolKind | null {
  const match = message.match(
    /\b(?:(?:all|every|each|the)\b(?:\s+\w+){0,3}|\w+\s+){0,1}(sticky\s+notes|stickies|rectangles|circles|lines|triangles|stars|connectors)\b/i,
  );
  if (!match) {
    return null;
  }
  const noun = match[1].toLowerCase();
  if (noun === "sticky notes" || noun === "stickies") return "sticky";
  if (noun === "rectangles") return "rect";
  if (noun === "circles") return "circle";
  if (noun === "lines") return "line";
  if (noun === "triangles") return "triangle";
  if (noun === "stars") return "star";
  if (noun === "connectors") return "connectorUndirected";
  return null;
}

export function planMoveAll(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bmove\b/.test(lower)) {
    return null;
  }
  const objectType = parseMoveAllType(input.message);
  if (!objectType) {
    return null;
  }
  const colorFilter = findColor(input.message);
  const candidates = input.boardState.filter((objectItem) => {
    if (objectItem.type !== objectType) return false;
    if (!colorFilter) return true;
    return objectItem.color.toLowerCase() === colorFilter.toLowerCase();
  });
  if (candidates.length === 0) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage: "No matching objects found to move.",
    };
  }
  if (candidates.length > MAX_MOVE_OBJECTS) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage: `Move up to ${MAX_MOVE_OBJECTS} objects per command.`,
    };
  }
  const targetPoint = parseCoordinatePoint(input.message);
  const sideTarget = parseSideTarget(input.message);
  if (targetPoint || sideTarget) {
    return {
      planned: true,
      intent: "move-all",
      assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"}${sideTarget ? ` to ${sideTarget} side` : ""}.`,
      plan: toPlan({
        id: "command.move-all",
        name: "Move Matching Objects",
        operations: [
          {
            tool: "moveObjects",
            args: {
              objectIds: candidates.map((objectItem) => objectItem.id),
              ...(targetPoint ? { toPoint: targetPoint } : {}),
              ...(sideTarget
                ? {
                    toViewportSide: {
                      side: sideTarget,
                      ...(input.viewportBounds ? { viewportBounds: input.viewportBounds } : {}),
                    },
                  }
                : {}),
            },
          },
        ],
      }),
    };
  }
  const delta = parseDirectionDelta(input.message);
  if (!delta) {
    return {
      planned: false,
      intent: "move-all",
      assistantMessage:
        "Specify a move direction or target position for matching objects.",
    };
  }
  return {
    planned: true,
    intent: "move-all",
    assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.move-all",
      name: "Move Matching Objects",
      operations: [
        {
          tool: "moveObjects",
          args: {
            objectIds: candidates.map((objectItem) => objectItem.id),
            delta: { dx: delta.x, dy: delta.y },
          },
        },
      ],
    }),
  };
}

function isFitFrameToContentsCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\bfit\b[\w\s]{0,20}\bframe\b[\w\s]{0,20}\bcontents?\b/.test(lower) ||
    /\bresize\b[\w\s]{0,20}\bframe\b[\w\s]{0,20}\bfit\b[\w\s]{0,20}\bcontents?\b/.test(
      lower,
    )
  );
}

function findFrameCandidateId(input: PlannerInput): string | null {
  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  const selectedFrames = selectedObjects.filter(
    (objectItem) => objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  if (selectedFrames.length > 0) {
    return selectedFrames[0].id;
  }
  const frames = input.boardState.filter(
    (objectItem) => objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  return frames.length === 1 ? frames[0].id : null;
}

export function planFitFrameToContents(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isFitFrameToContentsCommand(input.message)) {
    return null;
  }
  const frameId = findFrameCandidateId(input);
  if (!frameId) {
    return {
      planned: false,
      intent: "fit-frame-to-contents",
      assistantMessage: "Select a frame first, then run resize frame to fit contents.",
    };
  }
  return {
    planned: true,
    intent: "fit-frame-to-contents",
    assistantMessage: "Resized frame to fit its contents.",
    plan: toPlan({
      id: "command.fit-frame-to-contents",
      name: "Fit Frame To Contents",
      operations: [
        {
          tool: "fitFrameToContents",
          args: {
            frameId,
            padding: parsePadding(input.message) ?? DEFAULT_FRAME_FIT_PADDING,
          },
        },
      ],
    }),
  };
}
