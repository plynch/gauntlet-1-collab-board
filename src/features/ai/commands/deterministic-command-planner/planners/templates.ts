import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";
import {
  findColor,
  normalizeMessage,
  parseCoordinatePoint,
  parseGridDimensions,
  parseJourneyStageCount,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import {
  getAutoSpawnPoint,
  getBoardBounds,
} from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import {
  COLOR_KEYWORDS,
  JOURNEY_DEFAULT_STAGES,
  JOURNEY_MAX_STAGES,
  JOURNEY_MIN_STAGES,
  JOURNEY_STAGE_SPACING_X,
  MAX_STICKY_BATCH_COUNT,
  RETRO_COLUMN_SPACING_X,
  STICKY_GRID_SPACING_X,
  STICKY_GRID_SPACING_Y,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import { parseStickyGridTextSeed } from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardToolCall } from "@/features/ai/types";

function isCreateStickyGridCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(add|create)\b/.test(lower) &&
    /\bgrid\b/.test(lower) &&
    /\bsticky(?:\s+note)?s?\b/.test(lower)
  );
}

export function planCreateStickyGrid(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateStickyGridCommand(input.message)) {
    return null;
  }
  const dimensions = parseGridDimensions(input.message);
  if (!dimensions) {
    return {
      planned: false,
      intent: "create-sticky-grid",
      assistantMessage:
        "Specify sticky grid dimensions, for example: create a 2x3 grid of sticky notes.",
    };
  }
  const point = getAutoSpawnPoint(input.boardState);
  const color = findColor(input.message) ?? COLOR_KEYWORDS.yellow;
  const textSeed = parseStickyGridTextSeed(input.message);
  const total = dimensions.rows * dimensions.columns;
  if (total > MAX_STICKY_BATCH_COUNT) {
    return {
      planned: false,
      intent: "create-sticky-grid",
      assistantMessage: `Create sticky grids up to ${MAX_STICKY_BATCH_COUNT} notes per command.`,
    };
  }
  return {
    planned: true,
    intent: "create-sticky-grid",
    assistantMessage: `Created ${dimensions.rows}x${dimensions.columns} sticky grid (${total} notes).`,
    plan: toPlan({
      id: "command.create-sticky-grid",
      name: "Create Sticky Note Grid",
      operations: [
        {
          tool: "createStickyBatch",
          args: {
            count: total,
            color,
            originX: point.x,
            originY: point.y,
            columns: dimensions.columns,
            gapX: STICKY_GRID_SPACING_X,
            gapY: STICKY_GRID_SPACING_Y,
            textPrefix: textSeed ?? "Sticky",
          },
        },
      ],
    }),
  };
}

function isCreateSwotTemplateCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasSwotLanguage = /\bswot\b/.test(lower);
  const hasTemplateLanguage = /\b(template|analysis|board|diagram)\b/.test(lower);
  return hasCreateVerb && hasSwotLanguage && hasTemplateLanguage;
}

export function planCreateSwotTemplate(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateSwotTemplateCommand(input.message)) {
    return null;
  }
  return {
    planned: true,
    intent: "swot-template",
    assistantMessage: "Created SWOT analysis template.",
    plan: buildSwotTemplatePlan({
      templateId: "swot.v1",
      boardBounds: getBoardBounds(input.boardState),
      selectedObjectIds: input.selectedObjectIds,
      existingObjectCount: input.boardState.length,
      viewportBounds: input.viewportBounds ?? null,
    }),
  };
}

function isCreateJourneyMapCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasJourneyLanguage =
    /\bjourney\s+map\b/.test(lower) || /\buser\s+journey\b/.test(lower);
  return hasCreateVerb && hasJourneyLanguage;
}

export function planCreateJourneyMap(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateJourneyMapCommand(input.message)) {
    return null;
  }
  const stageCount = parseJourneyStageCount(input.message) ?? JOURNEY_DEFAULT_STAGES;
  if (stageCount < JOURNEY_MIN_STAGES || stageCount > JOURNEY_MAX_STAGES) {
    return {
      planned: false,
      intent: "create-journey-map",
      assistantMessage: `Create journey maps with ${JOURNEY_MIN_STAGES}-${JOURNEY_MAX_STAGES} stages.`,
    };
  }
  const spawnPoint =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const frameWidth = Math.max(760, stageCount * JOURNEY_STAGE_SPACING_X + 120);
  const stageNames = ["Discover", "Consider", "Sign Up", "Onboard", "Adopt", "Retain", "Advocate", "Renew"];
  const operations: BoardToolCall[] = [
    {
      tool: "createFrame",
      args: {
        title: `User Journey Map (${stageCount} stages)`,
        x: spawnPoint.x,
        y: spawnPoint.y,
        width: frameWidth,
        height: 360,
      },
    },
  ];
  for (let index = 0; index < stageCount; index += 1) {
    operations.push({
      tool: "createStickyNote",
      args: {
        text: `${index + 1}. ${stageNames[index] ?? `Stage ${index + 1}`}`,
        x: spawnPoint.x + 30 + index * JOURNEY_STAGE_SPACING_X,
        y: spawnPoint.y + 88,
        color: COLOR_KEYWORDS.yellow,
      },
    });
  }
  return {
    planned: true,
    intent: "create-journey-map",
    assistantMessage: `Created user journey map with ${stageCount} stages.`,
    plan: toPlan({
      id: "command.create-journey-map",
      name: "Create User Journey Map",
      operations,
    }),
  };
}

function isCreateRetrospectiveCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return /\b(add|create|build|set up|setup)\b/.test(lower) && /\b(retrospective|retro)\b/.test(lower);
}

export function planCreateRetrospectiveBoard(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  if (!isCreateRetrospectiveCommand(input.message)) {
    return null;
  }
  const spawnPoint =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
  const columns = [
    { title: "What Went Well", color: COLOR_KEYWORDS.green },
    { title: "What Didn't", color: COLOR_KEYWORDS.pink },
    { title: "Action Items", color: COLOR_KEYWORDS.blue },
  ] as const;
  const operations: BoardToolCall[] = [
    {
      tool: "createFrame",
      args: {
        title: "Retrospective Board",
        x: spawnPoint.x,
        y: spawnPoint.y,
        width: 1020,
        height: 420,
      },
    },
  ];
  columns.forEach((column, index) => {
    operations.push({
      tool: "createStickyNote",
      args: {
        text: column.title,
        x: spawnPoint.x + 40 + index * RETRO_COLUMN_SPACING_X,
        y: spawnPoint.y + 72,
        color: column.color,
      },
    });
  });
  return {
    planned: true,
    intent: "create-retrospective-board",
    assistantMessage:
      "Created retrospective board with What Went Well, What Didn't, and Action Items columns.",
    plan: toPlan({
      id: "command.create-retrospective-board",
      name: "Create Retrospective Board",
      operations,
    }),
  };
}
