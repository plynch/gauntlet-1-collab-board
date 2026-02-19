import type {
  TemplateInstantiateInput,
  TemplatePlan,
} from "@/features/ai/types";
import {
  clampToFinite,
  normalizeBounds,
  SWOT_TEMPLATE_ID,
  SWOT_TEMPLATE_NAME,
} from "@/features/ai/templates/template-types";

type SwotQuadrant = {
  key: "strengths" | "weaknesses" | "opportunities" | "threats";
  label: string;
  color: string;
  row: number;
  col: number;
};

const DEFAULT_QUADRANT_WIDTH = 340;
const DEFAULT_QUADRANT_HEIGHT = 220;
const QUADRANT_GAP = 2;
const QUADRANT_GRID_ROWS = 2;
const QUADRANT_GRID_COLS = 2;
const QUADRANT_RIGHT_PADDING = 160;
const VIEWPORT_FILL_RATIO = 0.9;
const MAX_GRID_WIDTH = 2_400;
const MAX_GRID_HEIGHT = 1_600;

/**
 * Normalizes viewport bounds.
 */
function normalizeViewportBounds(
  bounds: TemplateInstantiateInput["viewportBounds"] | null | undefined,
):
  | {
      left: number;
      top: number;
      width: number;
      height: number;
    }
  | null {
  if (!bounds) {
    return null;
  }

  const left = clampToFinite(bounds.left, 0);
  const top = clampToFinite(bounds.top, 0);
  const width = Math.max(0, clampToFinite(bounds.width, 0));
  const height = Math.max(0, clampToFinite(bounds.height, 0));

  if (width <= 0 || height <= 0) {
    return null;
  }

  return {
    left,
    top,
    width,
    height,
  };
}

/**
 * Builds swot quadrants.
 */
function buildSwotQuadrants(): SwotQuadrant[] {
  return [
    {
      key: "strengths",
      label: "Strengths",
      color: "#a7f3d0",
      row: 0,
      col: 0,
    },
    {
      key: "weaknesses",
      label: "Weaknesses",
      color: "#fecaca",
      row: 0,
      col: 1,
    },
    {
      key: "opportunities",
      label: "Opportunities",
      color: "#a7f3d0",
      row: 1,
      col: 0,
    },
    {
      key: "threats",
      label: "Threats",
      color: "#fecaca",
      row: 1,
      col: 1,
    },
  ];
}

/**
 * Builds swot template plan.
 */
export function buildSwotTemplatePlan(
  input: TemplateInstantiateInput,
): TemplatePlan {
  const normalizedBounds = normalizeBounds(input.boardBounds);
  const normalizedViewportBounds = normalizeViewportBounds(
    input.viewportBounds,
  );
  const quadrants = buildSwotQuadrants();
  const minimumGridWidth =
    DEFAULT_QUADRANT_WIDTH * QUADRANT_GRID_COLS +
    QUADRANT_GAP * (QUADRANT_GRID_COLS - 1);
  const minimumGridHeight =
    DEFAULT_QUADRANT_HEIGHT * QUADRANT_GRID_ROWS +
    QUADRANT_GAP * (QUADRANT_GRID_ROWS - 1);
  const gridWidth = normalizedViewportBounds
    ? Math.max(
        minimumGridWidth,
        Math.min(
          MAX_GRID_WIDTH,
          Math.round(normalizedViewportBounds.width * VIEWPORT_FILL_RATIO),
        ),
      )
    : minimumGridWidth;
  const gridHeight = normalizedViewportBounds
    ? Math.max(
        minimumGridHeight,
        Math.min(
          MAX_GRID_HEIGHT,
          Math.round(normalizedViewportBounds.height * VIEWPORT_FILL_RATIO),
        ),
      )
    : minimumGridHeight;
  const startX = normalizedViewportBounds
    ? Math.round(
        normalizedViewportBounds.left +
          (normalizedViewportBounds.width - gridWidth) / 2,
      )
    : normalizedBounds
      ? normalizedBounds.right + QUADRANT_RIGHT_PADDING
      : 160;
  const startY = normalizedViewportBounds
    ? Math.round(
        normalizedViewportBounds.top +
          (normalizedViewportBounds.height - gridHeight) / 2,
      )
    : normalizedBounds
      ? normalizedBounds.top
      : 120;

  const operations: TemplatePlan["operations"] = [
    {
      tool: "createGridContainer" as const,
      args: {
        x: startX,
        y: startY,
        width: gridWidth,
        height: gridHeight,
        rows: QUADRANT_GRID_ROWS,
        cols: QUADRANT_GRID_COLS,
        gap: QUADRANT_GAP,
        containerTitle: "SWOT Analysis",
        cellColors: quadrants.map((quadrant) => quadrant.color),
        sectionTitles: quadrants.map((quadrant) => quadrant.label),
        sectionNotes: quadrants.map(() => ""),
      },
    },
  ];

  return {
    templateId: SWOT_TEMPLATE_ID,
    templateName: SWOT_TEMPLATE_NAME,
    operations,
    metadata: {
      autoPlacement: normalizedViewportBounds
        ? "viewport-centered"
        : "right-of-existing-content",
      quadrants: quadrants.map((quadrant) => quadrant.key),
    },
  };
}
