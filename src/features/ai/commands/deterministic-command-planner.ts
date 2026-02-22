import type {
  BoardObjectSnapshot,
  BoardObjectToolKind,
  BoardToolCall,
  BoardSelectionUpdate,
  TemplatePlan,
} from "@/features/ai/types";
import {
  clampObjectTopLeftToSection,
  getGridSectionBoundsFromGeometry,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import { buildSwotTemplatePlan } from "@/features/ai/templates/swot-template";
import {
  escapeRegex,
  findColor,
  getAnalysisSource,
  getIntersectionBounds,
  getSelectedObjects,
  normalizeMessage,
  parseActionItemCandidates,
  parseCoordinatePoint,
  parseGridColumns,
  parseGridDimensions,
  parseJourneyStageCount,
  parsePadding,
  parseSize,
  resolveLayoutTargets,
  toTextSnippet,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import {
  clampPointToFrameBounds,
  getAutoSpawnPoint,
  getBoardBounds,
  getViewportAnchoredStickyOrigin,
  isAddToContainerCommand,
  isViewportDistributionRequested,
  normalizeFrameTitle,
  parseAlignmentMode,
  parseDirectionDelta,
  parseDistributionAxis,
  parseGridGap,
  parseSideTarget,
  parseStickyBatchClause,
  parseStickyGridTextSeed,
  parseStickyText,
  resolveContainerStickyOrigin,
  resolveContainerTarget,
  splitStickyCreationClauses,
  type ParsedStickyBatchClause,
} from "@/features/ai/commands/deterministic-command-planner-layout-parsers";
import {
  ACTION_ITEM_COLOR,
  ACTION_ITEM_GRID_COLUMNS,
  ACTION_ITEM_SPACING_X,
  ACTION_ITEM_SPACING_Y,
  COLOR_KEYWORDS,
  DEFAULT_FRAME_FIT_PADDING,
  DEFAULT_SIZES,
  GRID_DEFAULT_COLUMNS,
  JOURNEY_DEFAULT_STAGES,
  JOURNEY_MAX_STAGES,
  JOURNEY_MIN_STAGES,
  JOURNEY_STAGE_SPACING_X,
  MAX_IMPLICIT_LAYOUT_OBJECTS,
  MAX_MOVE_OBJECTS,
  MAX_STICKY_BATCH_COUNT,
  MAX_SUMMARY_BULLETS,
  RETRO_COLUMN_SPACING_X,
  STICKY_GRID_SPACING_X,
  STICKY_GRID_SPACING_Y,
  SWOT_SECTION_ALIASES,
  SWOT_SECTION_CONTENT_PADDING_BOTTOM,
  SWOT_SECTION_CONTENT_PADDING_X,
  SWOT_SECTION_CONTENT_TOP_PADDING,
  SWOT_SECTION_DEFAULT_INDEX,
  SWOT_SECTION_ITEM_GAP_X,
  SWOT_SECTION_ITEM_GAP_Y,
  SWOT_SECTION_KEYS,
  SWOT_SECTION_STICKY_COLORS,
  type Bounds,
  type Point,
  type Size,
  type SwotSectionKey,
} from "@/features/ai/commands/deterministic-command-planner-constants";
import type { PlannerInput } from "@/features/ai/commands/deterministic-command-planner-types";

export type DeterministicCommandPlanResult =
  | {
      planned: true;
      intent: string;
      assistantMessage: string;
      plan: TemplatePlan;
      selectionUpdate?: BoardSelectionUpdate;
    }
  | {
      planned: false;
      intent: string;
      assistantMessage: string;
      selectionUpdate?: BoardSelectionUpdate;
    };

function parseSwotSectionTarget(message: string): SwotSectionKey | null {
  const lower = normalizeMessage(message);

  for (const key of SWOT_SECTION_KEYS) {
    const hasMatch = SWOT_SECTION_ALIASES[key].some((alias) =>
      new RegExp(`\\b${escapeRegex(alias)}\\b`, "i").test(lower),
    );
    if (hasMatch) {
      return key;
    }
  }

  return null;
}

function parseSwotItemText(
  message: string,
  section: SwotSectionKey,
): string | null {
  const quotedMatch = message.match(/["“”']([^"“”']+)["“”']/);
  if (quotedMatch) {
    return quotedMatch[1].trim().slice(0, 1_000);
  }

  const aliases = SWOT_SECTION_ALIASES[section]
    .map((alias) => escapeRegex(alias))
    .join("|");
  const trailingMatch = message.match(
    new RegExp(`\\b(?:${aliases})\\b\\s*(?:-|:|=)?\\s*(.+)$`, "i"),
  );
  if (!trailingMatch) {
    return null;
  }

  const value = trailingMatch[1]
    .trim()
    .replace(/^(?:note|item)\s*(?:-|:)?\s*/i, "")
    .trim();
  if (value.length === 0) {
    return null;
  }

  return value.slice(0, 1_000);
}

function getSwotSectionContentBounds(sectionBounds: Bounds): Bounds {
  const left = sectionBounds.left + SWOT_SECTION_CONTENT_PADDING_X;
  const right = sectionBounds.right - SWOT_SECTION_CONTENT_PADDING_X;
  const top = sectionBounds.top + SWOT_SECTION_CONTENT_TOP_PADDING;
  const bottom = sectionBounds.bottom - SWOT_SECTION_CONTENT_PADDING_BOTTOM;

  return {
    left,
    right: Math.max(left + 1, right),
    top,
    bottom: Math.max(top + 1, bottom),
  };
}

function isPointWithinBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function getObjectCenterPoint(objectItem: BoardObjectSnapshot): Point {
  return {
    x: objectItem.x + objectItem.width / 2,
    y: objectItem.y + objectItem.height / 2,
  };
}

function getNextSwotStickyTopLeft(options: {
  boardState: BoardObjectSnapshot[];
  sectionBounds: Bounds;
  stickySize: Size;
}): Point {
  const contentBounds = getSwotSectionContentBounds(options.sectionBounds);
  const existingStickiesInSection = options.boardState
    .filter((objectItem) => objectItem.type === "sticky")
    .filter((objectItem) =>
      isPointWithinBounds(
        getObjectCenterPoint(objectItem),
        options.sectionBounds,
      ),
    );
  const contentWidth = Math.max(1, contentBounds.right - contentBounds.left);
  const columns = Math.max(
    1,
    Math.floor(
      (contentWidth + SWOT_SECTION_ITEM_GAP_X) /
        (options.stickySize.width + SWOT_SECTION_ITEM_GAP_X),
    ),
  );
  const slotIndex = existingStickiesInSection.length;
  const preferredTopLeft = {
    x:
      contentBounds.left +
      (slotIndex % columns) * (options.stickySize.width + SWOT_SECTION_ITEM_GAP_X),
    y:
      contentBounds.top +
      Math.floor(slotIndex / columns) *
        (options.stickySize.height + SWOT_SECTION_ITEM_GAP_Y),
  };

  return clampObjectTopLeftToSection(
    contentBounds,
    options.stickySize,
    preferredTopLeft,
  );
}

function findSwotSectionPlacement(options: {
  boardState: BoardObjectSnapshot[];
  section: SwotSectionKey;
}):
  | {
      containerId: string;
      sectionIndex: number;
      sectionBounds: {
        left: number;
        right: number;
        top: number;
        bottom: number;
      };
    }
  | null {
  const containers = options.boardState
    .filter((objectItem) => objectItem.type === "gridContainer")
    .sort((left, right) => right.zIndex - left.zIndex);

  for (const container of containers) {
    const rows = Math.max(1, container.gridRows ?? 2);
    const cols = Math.max(1, container.gridCols ?? 2);
    const gap = Math.max(0, container.gridGap ?? 2);
    const sectionBounds = getGridSectionBoundsFromGeometry(
      {
        x: container.x,
        y: container.y,
        width: container.width,
        height: container.height,
      },
      rows,
      cols,
      gap,
    );
    const totalSections = sectionBounds.length;
    if (totalSections === 0) {
      continue;
    }

    const sectionTitles = Array.from(
      { length: totalSections },
      (_, index) => container.gridSectionTitles?.[index]?.trim() ?? "",
    );
    const aliasForTarget = SWOT_SECTION_ALIASES[options.section];
    const explicitSectionIndex = sectionTitles.findIndex((title) => {
      const lowerTitle = title.toLowerCase();
      return aliasForTarget.some((alias) => lowerTitle.includes(alias));
    });
    if (explicitSectionIndex >= 0) {
      return {
        containerId: container.id,
        sectionIndex: explicitSectionIndex,
        sectionBounds: sectionBounds[explicitSectionIndex]!,
      };
    }

    const isSwotContainer = (container.containerTitle ?? "")
      .toLowerCase()
      .includes("swot");
    if (!isSwotContainer) {
      continue;
    }

    const defaultSectionIndex = SWOT_SECTION_DEFAULT_INDEX[options.section];
    if (defaultSectionIndex >= totalSections) {
      continue;
    }

    return {
      containerId: container.id,
      sectionIndex: defaultSectionIndex,
      sectionBounds: sectionBounds[defaultSectionIndex]!,
    };
  }

  return null;
}

function parseShapeType(message: string): BoardObjectToolKind | null {
  const lower = normalizeMessage(message);
  if (/\bsticky(?:\s+note)?s?\b/.test(lower)) {
    return "sticky";
  }
  if (/\brect(?:angle)?s?\b/.test(lower)) {
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

  return null;
}

function toPlan(options: {
  id: string;
  name: string;
  operations: BoardToolCall[];
}): TemplatePlan {
  return {
    templateId: options.id,
    templateName: options.name,
    operations: options.operations,
  };
}

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

function planUnselectObjects(
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
    selectionUpdate: {
      mode: "clear",
      objectIds: [],
    },
  };
}

function isSelectAllCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return /\bselect\s+(all|everything)\b/.test(lower);
}

function isSelectVisibleCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return /\bselect\s+visible\b/.test(lower);
}

function planSelectAllObjects(
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
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
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

function planSelectVisibleObjects(
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
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
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
      selectionUpdate: {
        mode: "replace",
        objectIds: [],
      },
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
    selectionUpdate: {
      mode: "replace",
      objectIds: visibleObjectIds,
    },
  };
}

function planClearBoard(
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

function isDeleteSelectedCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(delete|remove)\b[\w\s]*\bselected\b/.test(lower) ||
    /\bdelete\s+selection\b/.test(lower) ||
    /\bremove\s+selection\b/.test(lower)
  );
}

function planDeleteSelected(
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

function planArrangeGrid(
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

function planAlignSelected(
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

function planDistributeSelected(
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

function isSummarizeCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(summarize|summarise|summary|recap)\b/.test(lower) &&
    !/\b(action items?|next steps?|todo|to-do)\b/.test(lower)
  );
}

function planSummarizeSource(
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
  const hasActionLanguage =
    /\b(action items?|next steps?|todo|to-do)\b/.test(lower);
  const hasExtractionLanguage =
    /\b(extract|generate|create|make|convert|turn)\b/.test(lower);

  return hasActionLanguage && hasExtractionLanguage;
}

function planExtractActionItems(
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

function isCreateStickyGridCommand(message: string): boolean {
  const lower = normalizeMessage(message);
  return (
    /\b(add|create)\b/.test(lower) &&
    /\bgrid\b/.test(lower) &&
    /\bsticky(?:\s+note)?s?\b/.test(lower)
  );
}

function planCreateStickyGrid(
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
  const hasTemplateLanguage = /\b(template|analysis|board|diagram)\b/.test(
    lower,
  );

  return hasCreateVerb && hasSwotLanguage && hasTemplateLanguage;
}

function planCreateSwotTemplate(
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

function planCreateJourneyMap(
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
  const stageNames = [
    "Discover",
    "Consider",
    "Sign Up",
    "Onboard",
    "Adopt",
    "Retain",
    "Advocate",
    "Renew",
  ];

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
  const hasCreateVerb = /\b(add|create|build|set up|setup)\b/.test(lower);
  const hasRetroLanguage = /\b(retrospective|retro)\b/.test(lower);
  return hasCreateVerb && hasRetroLanguage;
}

function planCreateRetrospectiveBoard(
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

function planCreateSticky(
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
          args: {
            text,
            x: point.x,
            y: point.y,
            color,
          },
        },
      ],
    }),
  };
}

function planCreateStickyBatch(
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
        ? resolveContainerStickyOrigin(
            containerTarget.object,
            input.message,
            {
              count: clause.count,
              columns: clause.columns,
              gapX: STICKY_GRID_SPACING_X,
              gapY: STICKY_GRID_SPACING_Y,
            },
          )
        : getViewportAnchoredStickyOrigin({
            message: clause.sourceText,
            viewportBounds: input.viewportBounds,
            count: clause.count,
            columns: clause.columns,
          }));

    let point = clause.point ?? fallbackPoint;
    if (!point) {
      point = getAutoSpawnPoint(input.boardState);
    }
    if (containerTarget && !parseCoordinatePoint(clause.sourceText)) {
      point = clampPointToFrameBounds(point, containerTarget.object);
    }

    if (index > 0 && !clause.hasExplicitPoint) {
      if (previousClause) {
        const lastPoint = previousClause.point ?? getAutoSpawnPoint(input.boardState);
        const lastSide = previousClause.side ?? null;

        if (lastSide === "left" || lastSide === "right") {
          point = {
            x: lastPoint.x,
            y: lastPoint.y + previousClause.clusterHeight + STICKY_GRID_SPACING_Y,
          };
        } else if (lastSide === "top" || lastSide === "bottom") {
          point = {
            x: lastPoint.x + previousClause.clusterWidth + STICKY_GRID_SPACING_X,
            y: lastPoint.y,
          };
        } else {
          point = {
            x: lastPoint.x + previousClause.clusterWidth + STICKY_GRID_SPACING_X,
            y: lastPoint.y,
          };
        }
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

    previousClause = {
      ...clause,
      point,
      rows: clause.rows,
      clusterWidth: clause.clusterWidth,
      clusterHeight: clause.clusterHeight,
    };
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

function planAddSwotSectionItem(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower)) {
    return null;
  }

  const targetSection = parseSwotSectionTarget(input.message);
  if (!targetSection) {
    return null;
  }

  const text = parseSwotItemText(input.message, targetSection);
  if (!text) {
    return {
      planned: false,
      intent: "add-swot-item",
      assistantMessage:
        "Add text for the SWOT item, for example: add a strength - \"our team\".",
    };
  }

  const placement = findSwotSectionPlacement({
    boardState: input.boardState,
    section: targetSection,
  });
  if (!placement) {
    return {
      planned: false,
      intent: "add-swot-item",
      assistantMessage:
        "Create a SWOT analysis first, then add strengths, weaknesses, opportunities, or threats.",
    };
  }

  const stickySize = DEFAULT_SIZES.sticky;
  const topLeft = getNextSwotStickyTopLeft({
    boardState: input.boardState,
    sectionBounds: placement.sectionBounds,
    stickySize,
  });
  const color = findColor(input.message) ?? SWOT_SECTION_STICKY_COLORS[targetSection];
  const label = targetSection.slice(0, -1);

  return {
    planned: true,
    intent: "add-swot-item",
    assistantMessage: `Added ${label} sticky note.`,
    plan: toPlan({
      id: "command.add-swot-item",
      name: "Add SWOT Item",
      operations: [
        {
          tool: "createStickyNote",
          args: {
            text,
            x: topLeft.x,
            y: topLeft.y,
            color,
          },
        },
      ],
    }),
  };
}

function planCreateFrame(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(add|create)\b/.test(lower) || !/\bframe\b/.test(lower)) {
    return null;
  }

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
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

function planCreateShape(
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

  const point =
    parseCoordinatePoint(input.message) ?? getAutoSpawnPoint(input.boardState);
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

function planMoveSelected(
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
              toPoint: {
                x: targetPoint.x,
                y: targetPoint.y,
              },
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
            delta: {
              dx: delta.x,
              dy: delta.y,
            },
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
  if (noun === "sticky notes" || noun === "stickies") {
    return "sticky";
  }

  if (noun === "rectangles") {
    return "rect";
  }

  if (noun === "circles") {
    return "circle";
  }

  if (noun === "lines") {
    return "line";
  }

  if (noun === "triangles") {
    return "triangle";
  }

  if (noun === "stars") {
    return "star";
  }

  if (noun === "connectors") {
    return "connectorUndirected";
  }

  return null;
}

function planMoveAll(
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
    if (objectItem.type !== objectType) {
      return false;
    }

    if (!colorFilter) {
      return true;
    }

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

  if (targetPoint) {
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
              toPoint: {
                x: targetPoint.x,
                y: targetPoint.y,
              },
            },
          },
        ],
      }),
    };
  }

  if (sideTarget) {
    return {
      planned: true,
      intent: "move-all",
      assistantMessage: `Moved ${candidates.length} ${objectType} object${candidates.length === 1 ? "" : "s"} to ${sideTarget} side.`,
      plan: toPlan({
        id: "command.move-all",
        name: "Move Matching Objects",
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
            delta: {
              dx: delta.x,
              dy: delta.y,
            },
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
    (objectItem) =>
      objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  if (selectedFrames.length > 0) {
    return selectedFrames[0].id;
  }

  const frames = input.boardState.filter(
    (objectItem) =>
      objectItem.type === "rect" || objectItem.type === "gridContainer",
  );
  if (frames.length === 1) {
    return frames[0].id;
  }

  return null;
}

function planFitFrameToContents(
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
      assistantMessage:
        "Select a frame first, then run resize frame to fit contents.",
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

function planResizeSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\bresize\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage: "Select one or more objects first, then run resize.",
    };
  }

  const size = parseSize(input.message);
  if (!size) {
    return {
      planned: false,
      intent: "resize-selected",
      assistantMessage:
        "Specify dimensions, for example: resize selected to 220 by 140.",
    };
  }

  return {
    planned: true,
    intent: "resize-selected",
    assistantMessage: `Resized ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.resize-selected",
      name: "Resize Selected Objects",
      operations: selectedObjects.map((objectItem) => ({
        tool: "resizeObject",
        args: {
          objectId: objectItem.id,
          width: size.width,
          height: size.height,
        },
      })),
    }),
  };
}

function planChangeColorSelected(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(change|set|make)\b/.test(lower) || !/\bcolor\b/.test(lower)) {
    return null;
  }

  const color = findColor(input.message);
  if (!color) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage:
        "I could not detect a supported color name in your command.",
    };
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "change-color",
      assistantMessage:
        "Select one or more objects first, then run color change.",
    };
  }

  return {
    planned: true,
    intent: "change-color",
    assistantMessage: `Changed color for ${selectedObjects.length} selected object${selectedObjects.length === 1 ? "" : "s"}.`,
    plan: toPlan({
      id: "command.change-color",
      name: "Change Selected Object Color",
      operations: selectedObjects.map((objectItem) => ({
        tool: "changeColor",
        args: {
          objectId: objectItem.id,
          color,
        },
      })),
    }),
  };
}

function planUpdateSelectedText(
  input: PlannerInput,
): DeterministicCommandPlanResult | null {
  const lower = normalizeMessage(input.message);
  if (!/\b(update|set|change)\b/.test(lower) || !/\btext\b/.test(lower)) {
    return null;
  }

  const selectedObjects = getSelectedObjects(
    input.boardState,
    input.selectedObjectIds,
  );
  if (selectedObjects.length === 0) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage: "Select one object first, then run text update.",
    };
  }

  const textMatch = input.message.match(/\bto\b\s+["“']?(.+?)["”']?$/i);
  const nextText = textMatch?.[1]?.trim();
  if (!nextText) {
    return {
      planned: false,
      intent: "update-text",
      assistantMessage:
        "Specify the new text, for example: update text to Q2 priorities.",
    };
  }

  const target = selectedObjects[0];
  return {
    planned: true,
    intent: "update-text",
    assistantMessage: "Updated selected object text.",
    plan: toPlan({
      id: "command.update-text",
      name: "Update Selected Text",
      operations: [
        {
          tool: "updateText",
          args: {
            objectId: target.id,
            newText: nextText.slice(0, 1_000),
          },
        },
      ],
    }),
  };
}

export function planDeterministicCommand(
  input: PlannerInput,
): DeterministicCommandPlanResult {
  const planners = [
    planClearBoard,
    planUnselectObjects,
    planSelectAllObjects,
    planSelectVisibleObjects,
    planDeleteSelected,
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

  for (const planner of planners) {
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
