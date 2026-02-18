import type { TemplateInstantiateInput, TemplatePlan } from "@/features/ai/types";
import {
  normalizeBounds,
  SWOT_TEMPLATE_ID,
  SWOT_TEMPLATE_NAME
} from "@/features/ai/templates/template-types";

type SwotQuadrant = {
  key: "strengths" | "weaknesses" | "opportunities" | "threats";
  label: string;
  color: string;
  x: number;
  y: number;
};

const QUADRANT_WIDTH = 340;
const QUADRANT_HEIGHT = 220;
const QUADRANT_GAP = 28;
const QUADRANT_RIGHT_PADDING = 160;
const LABEL_OFFSET_X = 16;
const LABEL_OFFSET_Y = 16;

function buildSwotQuadrants(startX: number, startY: number): SwotQuadrant[] {
  return [
    {
      key: "strengths",
      label: "Strengths",
      color: "#d1fae5",
      x: startX,
      y: startY
    },
    {
      key: "weaknesses",
      label: "Weaknesses",
      color: "#fee2e2",
      x: startX + QUADRANT_WIDTH + QUADRANT_GAP,
      y: startY
    },
    {
      key: "opportunities",
      label: "Opportunities",
      color: "#dbeafe",
      x: startX,
      y: startY + QUADRANT_HEIGHT + QUADRANT_GAP
    },
    {
      key: "threats",
      label: "Threats",
      color: "#fef3c7",
      x: startX + QUADRANT_WIDTH + QUADRANT_GAP,
      y: startY + QUADRANT_HEIGHT + QUADRANT_GAP
    }
  ];
}

export function buildSwotTemplatePlan(input: TemplateInstantiateInput): TemplatePlan {
  const normalizedBounds = normalizeBounds(input.boardBounds);
  const startX = normalizedBounds ? normalizedBounds.right + QUADRANT_RIGHT_PADDING : 160;
  const startY = normalizedBounds ? normalizedBounds.top : 120;
  const quadrants = buildSwotQuadrants(startX, startY);

  const operations: TemplatePlan["operations"] = [
    ...quadrants.map((quadrant) => ({
      tool: "createShape" as const,
      args: {
        type: "rect" as const,
        x: quadrant.x,
        y: quadrant.y,
        width: QUADRANT_WIDTH,
        height: QUADRANT_HEIGHT,
        color: quadrant.color
      }
    })),
    ...quadrants.map((quadrant) => ({
      tool: "createStickyNote" as const,
      args: {
        text: quadrant.label,
        x: quadrant.x + LABEL_OFFSET_X,
        y: quadrant.y + LABEL_OFFSET_Y,
        color: "#fef3c7"
      }
    }))
  ];

  return {
    templateId: SWOT_TEMPLATE_ID,
    templateName: SWOT_TEMPLATE_NAME,
    operations,
    metadata: {
      autoPlacement: "right-of-existing-content",
      quadrants: quadrants.map((quadrant) => quadrant.key)
    }
  };
}
