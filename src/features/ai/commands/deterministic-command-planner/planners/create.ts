import {
  clampPointToFrameBounds,
  getAutoSpawnPoint,
  getViewportAnchoredStickyOrigin,
  normalizeFrameTitle,
  parseStickyBatchClause,
  parseStickyText,
  resolveContainerStickyOrigin,
  resolveContainerTarget,
  splitStickyCreationClauses,
  type ParsedStickyBatchClause,
  isAddToContainerCommand,
} from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import {
  findColor,
  normalizeMessage,
  parseCoordinatePoint,
  parseSize,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import {
  COLOR_KEYWORDS,
  DEFAULT_SIZES,
  MAX_STICKY_BATCH_COUNT,
  STICKY_GRID_SPACING_X,
  STICKY_GRID_SPACING_Y,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardObjectToolKind, BoardToolCall } from "@/features/ai/types";

function parseShapeType(message: string): BoardObjectToolKind | null {
  const lower = normalizeMessage(message);
  if (/\bsticky(?:\s+note)?s?\b/.test(lower)) return "sticky";
  if (/\brect(?:angle)?s?\b/.test(lower)) return "rect";
  if (/\bcircles?\b/.test(lower)) return "circle";
  if (/\blines?\b/.test(lower)) return "line";
  if (/\btriangles?\b/.test(lower)) return "triangle";
  if (/\bstars?\b/.test(lower)) return "star";
  return null;
}

export function planCreateSticky(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (
    !/\b(add|create)\b/.test(lower) ||
    !/\b(?:sticky(?:\s+note)?s?|notes?)\b/.test(lower)
  ) {
    return null;
  }
  const point =
    parseCoordinatePoint(input.message) ??
    getViewportAnchoredStickyOrigin({
      message: input.message,
      viewportBounds: input.viewportBounds,
      count: 1,
      columns: 1,
    }) ??
    getAutoSpawnPoint(input.boardState);
  const color = findColor(input.message) ?? COLOR_KEYWORDS.yellow;
  const text = parseStickyText(input.message);
  return {
    planned: true,
    intent: "create-sticky",
    assistantMessage: "Created sticky note.",
    plan: toPlan({
      id: "command.create-sticky",
      name: "Create Sticky Note",
      operations: [
        {
          tool: "createStickyNote",
          args: { text, x: point.x, y: point.y, color },
        },
      ],
    }),
  };
}

export function planCreateStickyBatch(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const batchClauses = splitStickyCreationClauses(input.message)
    .map((clause) => parseStickyBatchClause(clause))
    .filter((clause): clause is ParsedStickyBatchClause => clause !== null);
  if (batchClauses.length === 0) {
    return null;
  }
  const oversizedClause = batchClauses.find(
    (clause) => clause.count > MAX_STICKY_BATCH_COUNT,
  );
  if (oversizedClause) {
    return {
      planned: false,
      intent: "create-sticky-batch",
      assistantMessage: `Create up to ${MAX_STICKY_BATCH_COUNT} sticky notes per command.`,
    };
  }
  const operations: BoardToolCall[] = [];
  let previousClause: ParsedStickyBatchClause | null = null;
  const containerTarget = isAddToContainerCommand(input.message)
    ? resolveContainerTarget(input)
    : null;
  if (isAddToContainerCommand(input.message) && !containerTarget) {
    return {
      planned: false,
      intent: "create-sticky-batch",
      assistantMessage:
        "I could not find a clear frame/container. Select a frame, make sure only one visible frame/container exists, or pass coordinates to place stickies.",
    };
  }
  batchClauses.forEach((clause, index) => {
    const fallbackPoint =
      parseCoordinatePoint(clause.sourceText) ??
      (containerTarget
        ? resolveContainerStickyOrigin(containerTarget.object, input.message, {
            count: clause.count,
            columns: clause.columns,
            gapX: STICKY_GRID_SPACING_X,
            gapY: STICKY_GRID_SPACING_Y,
          })
        : getViewportAnchoredStickyOrigin({
            message: clause.sourceText,
            viewportBounds: input.viewportBounds,
            count: clause.count,
            columns: clause.columns,
          }));
    let point = clause.point ?? fallbackPoint ?? getAutoSpawnPoint(input.boardState);
    if (containerTarget && !parseCoordinatePoint(clause.sourceText)) {
      point = clampPointToFrameBounds(point, containerTarget.object);
    }
    if (index > 0 && !clause.hasExplicitPoint && previousClause) {
      const lastPoint = previousClause.point ?? getAutoSpawnPoint(input.boardState);
      const lastSide = previousClause.side ?? null;
      if (lastSide === "left" || lastSide === "right") {
        point = {
          x: lastPoint.x,
          y: lastPoint.y + previousClause.clusterHeight + STICKY_GRID_SPACING_Y,
        };
      } else {
        point = {
          x: lastPoint.x + previousClause.clusterWidth + STICKY_GRID_SPACING_X,
          y: lastPoint.y,
        };
      }
      if (containerTarget) {
        point = clampPointToFrameBounds(point, containerTarget.object);
      }
    }
    operations.push({
      tool: "createStickyBatch",
      args: {
        count: clause.count,
        color: clause.color,
        originX: point.x,
        originY: point.y,
        columns: clause.columns,
        gapX: STICKY_GRID_SPACING_X,
        gapY: STICKY_GRID_SPACING_Y,
        textPrefix: clause.textPrefix,
      },
    });
    previousClause = { ...clause, point };
  });
  return {
    planned: true,
    intent: "create-sticky-batch",
    assistantMessage: `Created ${batchClauses.length} sticky note requests.`,
    plan: toPlan({
      id: "command.create-sticky-batch",
      name: "Create Sticky Notes",
      operations,
    }),
  };
}

export function planCreateFrame(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower) || !/\bframe\b/.test(lower)) {
    return null;
  }
  const point = parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const size = parseSize(input.message) ?? { width: 520, height: 340 };
  const titleMatch = input.message.match(
    /\b(?:called|named|title)\b\s+["“']?([^"”'\r\n]+?)(?:["”']|\s*$)/i,
  );
  const title = titleMatch?.[1]
    ? normalizeFrameTitle(titleMatch[1]) || "New frame"
    : "New frame";
  return {
    planned: true,
    intent: "create-frame",
    assistantMessage: "Created frame.",
    plan: toPlan({
      id: "command.create-frame",
      name: "Create Frame",
      operations: [
        {
          tool: "createFrame",
          args: {
            title: title.slice(0, 200),
            x: point.x,
            y: point.y,
            width: size.width,
            height: size.height,
          },
        },
      ],
    }),
  };
}

export function planCreateShape(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower)) {
    return null;
  }
  const shapeType = parseShapeType(input.message);
  if (!shapeType || shapeType === "sticky") {
    return null;
  }
  const point = parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const size = parseSize(input.message) ?? DEFAULT_SIZES[shapeType];
  const color = findColor(input.message) ?? COLOR_KEYWORDS.blue;
  return {
    planned: true,
    intent: `create-${shapeType}`,
    assistantMessage: `Created ${shapeType} shape.`,
    plan: toPlan({
      id: `command.create-${shapeType}`,
      name: "Create Shape",
      operations: [
        {
          tool: "createShape",
          args: {
            type: shapeType,
            x: point.x,
            y: point.y,
            width: size.width,
            height: size.height,
            color,
          },
        },
      ],
    }),
  };
}
