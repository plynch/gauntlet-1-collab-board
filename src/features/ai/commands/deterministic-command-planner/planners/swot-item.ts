import {
  clampObjectTopLeftToSection,
  getGridSectionBoundsFromGeometry,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import {
  escapeRegex,
  findColor,
  normalizeMessage,
} from "@/features/ai/commands/deterministic-command-planner-base-utils";
import {
  DEFAULT_SIZES,
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
import {
  type DeterministicCommandPlanResult,
  toPlan,
} from "@/features/ai/commands/deterministic-command-planner-result";
import type { BoardObjectSnapshot } from "@/features/ai/types";

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

function parseSwotItemText(message: string, section: SwotSectionKey): string | null {
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
  return clampObjectTopLeftToSection(contentBounds, options.stickySize, preferredTopLeft);
}

function findSwotSectionPlacement(options: {
  boardState: BoardObjectSnapshot[];
  section: SwotSectionKey;
}):
  | {
      sectionBounds: Bounds;
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
      { x: container.x, y: container.y, width: container.width, height: container.height },
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
      return { sectionBounds: sectionBounds[explicitSectionIndex]! };
    }
    const isSwotContainer = (container.containerTitle ?? "").toLowerCase().includes("swot");
    if (!isSwotContainer) {
      continue;
    }
    const defaultSectionIndex = SWOT_SECTION_DEFAULT_INDEX[options.section];
    if (defaultSectionIndex < totalSections) {
      return { sectionBounds: sectionBounds[defaultSectionIndex]! };
    }
  }
  return null;
}

export function planAddSwotSectionItem(
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
