import type {
  TemplateInstantiateInput,
  TemplatePlan,
} from "@/features/ai/types";
import {
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

const QUADRANT_WIDTH = 340;
const QUADRANT_HEIGHT = 220;
const QUADRANT_GAP = 2;
const QUADRANT_GRID_ROWS = 2;
const QUADRANT_GRID_COLS = 2;
const QUADRANT_RIGHT_PADDING = 160;

/**
 * Builds swot quadrants.
 */
function buildSwotQuadrants(): SwotQuadrant[] {
  return [
    {
      key: "strengths",
      label: "Strengths",
      color: "#d1fae5",
      row: 0,
      col: 0,
    },
    {
      key: "weaknesses",
      label: "Weaknesses",
      color: "#fee2e2",
      row: 0,
      col: 1,
    },
    {
      key: "opportunities",
      label: "Opportunities",
      color: "#dbeafe",
      row: 1,
      col: 0,
    },
    {
      key: "threats",
      label: "Threats",
      color: "#fef3c7",
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
  const startX = normalizedBounds
    ? normalizedBounds.right + QUADRANT_RIGHT_PADDING
    : 160;
  const startY = normalizedBounds ? normalizedBounds.top : 120;
  const quadrants = buildSwotQuadrants();
  const gridWidth =
    QUADRANT_WIDTH * QUADRANT_GRID_COLS +
    QUADRANT_GAP * (QUADRANT_GRID_COLS - 1);
  const gridHeight =
    QUADRANT_HEIGHT * QUADRANT_GRID_ROWS +
    QUADRANT_GAP * (QUADRANT_GRID_ROWS - 1);

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
      autoPlacement: "right-of-existing-content",
      quadrants: quadrants.map((quadrant) => quadrant.key),
    },
  };
}
