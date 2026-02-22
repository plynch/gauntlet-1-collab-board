import type { BoardObjectToolKind } from "@/features/ai/types";

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export type SwotSectionKey =
  | "strengths"
  | "weaknesses"
  | "opportunities"
  | "threats";

export type Bounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export const COLOR_KEYWORDS: Record<string, string> = {
  yellow: "#fde68a",
  orange: "#fdba74",
  red: "#fca5a5",
  pink: "#f9a8d4",
  purple: "#c4b5fd",
  blue: "#93c5fd",
  teal: "#99f6e4",
  green: "#86efac",
  gray: "#d1d5db",
  grey: "#d1d5db",
  tan: "#d2b48c",
  black: "#1f2937",
};

export const DEFAULT_SIZES: Record<BoardObjectToolKind, Size> = {
  sticky: { width: 220, height: 170 },
  rect: { width: 240, height: 150 },
  circle: { width: 170, height: 170 },
  gridContainer: { width: 708, height: 468 },
  line: { width: 240, height: 64 },
  connectorUndirected: { width: 220, height: 120 },
  connectorArrow: { width: 220, height: 120 },
  connectorBidirectional: { width: 220, height: 120 },
  triangle: { width: 180, height: 170 },
  star: { width: 180, height: 180 },
};

export const GRID_DEFAULT_COLUMNS = 3;
export const STICKY_GRID_SPACING_X = 240;
export const STICKY_GRID_SPACING_Y = 190;
export const STICKY_BATCH_DEFAULT_COLUMNS = 5;
export const MAX_STICKY_BATCH_COUNT = 50;
export const MAX_SUMMARY_BULLETS = 5;
export const MAX_ACTION_ITEM_CANDIDATES = 8;
export const ACTION_ITEM_GRID_COLUMNS = 4;
export const MAX_IMPLICIT_LAYOUT_OBJECTS = 50;
export const ACTION_ITEM_SPACING_X = 240;
export const ACTION_ITEM_SPACING_Y = 190;
export const ACTION_ITEM_COLOR = COLOR_KEYWORDS.green;
export const JOURNEY_DEFAULT_STAGES = 5;
export const JOURNEY_MIN_STAGES = 3;
export const JOURNEY_MAX_STAGES = 8;
export const JOURNEY_STAGE_SPACING_X = 230;
export const RETRO_COLUMN_SPACING_X = 320;
export const MAX_MOVE_OBJECTS = 500;
export const DEFAULT_FRAME_FIT_PADDING = 40;
export const STICKY_FRAME_PADDING = 24;
export const STICKY_BATCH_TOOL_SIZE = {
  width: 180,
  height: 140,
} as const;
export const STICKY_VIEWPORT_PADDING = 32;
export const SWOT_SECTION_KEYS: SwotSectionKey[] = [
  "strengths",
  "weaknesses",
  "opportunities",
  "threats",
];
export const SWOT_SECTION_ALIASES: Record<SwotSectionKey, string[]> = {
  strengths: ["strength", "strengths"],
  weaknesses: ["weakness", "weaknesses"],
  opportunities: ["opportunity", "opportunities"],
  threats: ["threat", "threats"],
};
export const SWOT_SECTION_DEFAULT_INDEX: Record<SwotSectionKey, number> = {
  strengths: 0,
  weaknesses: 1,
  opportunities: 2,
  threats: 3,
};
export const SWOT_SECTION_STICKY_COLORS: Record<SwotSectionKey, string> = {
  strengths: COLOR_KEYWORDS.green,
  weaknesses: COLOR_KEYWORDS.red,
  opportunities: COLOR_KEYWORDS.teal,
  threats: COLOR_KEYWORDS.orange,
};
export const SWOT_SECTION_CONTENT_PADDING_X = 16;
export const SWOT_SECTION_CONTENT_PADDING_BOTTOM = 16;
export const SWOT_SECTION_CONTENT_TOP_PADDING = 44;
export const SWOT_SECTION_ITEM_GAP_X = 16;
export const SWOT_SECTION_ITEM_GAP_Y = 16;
