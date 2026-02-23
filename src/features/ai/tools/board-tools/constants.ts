import type { Firestore } from "firebase-admin/firestore";

import type { BoardObjectToolKind } from "@/features/ai/types";

export const DELETE_BATCH_CHUNK_SIZE = 400;
export const GRID_MIN_ROWS = 1;
export const GRID_MAX_ROWS = 8;
export const GRID_MIN_COLS = 1;
export const GRID_MAX_COLS = 8;
export const GRID_MIN_GAP = 0;
export const GRID_MAX_GAP = 80;
export const GRID_DEFAULT_GAP = 2;
export const LAYOUT_GRID_MIN_COLUMNS = 1;
export const LAYOUT_GRID_MAX_COLUMNS = 8;
export const LAYOUT_GRID_DEFAULT_COLUMNS = 3;
export const LAYOUT_GRID_MIN_GAP = 0;
export const LAYOUT_GRID_MAX_GAP = 400;
export const LAYOUT_GRID_DEFAULT_GAP = 32;
export const STICKY_BATCH_MIN_COUNT = 1;
export const STICKY_BATCH_MAX_COUNT = 50;
export const STICKY_BATCH_DEFAULT_COLUMNS = 5;
export const STICKY_BATCH_MIN_COLUMNS = 1;
export const STICKY_BATCH_MAX_COLUMNS = 10;
export const STICKY_BATCH_DEFAULT_GAP_X = 240;
export const STICKY_BATCH_DEFAULT_GAP_Y = 190;
export const SHAPE_BATCH_MIN_COUNT = 1;
export const SHAPE_BATCH_MAX_COUNT = 50;
export const SHAPE_BATCH_MIN_COLUMNS = 1;
export const SHAPE_BATCH_MAX_COLUMNS = 8;
export const SHAPE_BATCH_DEFAULT_WIDTH = 220;
export const SHAPE_BATCH_DEFAULT_HEIGHT = 160;
export const SHAPE_BATCH_MIN_GAP = 0;
export const SHAPE_BATCH_MAX_GAP = 400;
export const STICKY_DEFAULT_COLOR = "#fde68a";
export const STICKY_PALETTE_COLORS = [
  "#fde68a",
  "#fdba74",
  "#fca5a5",
  "#f9a8d4",
  "#c4b5fd",
  "#93c5fd",
  "#99f6e4",
  "#86efac",
  "#d1d5db",
  "#d2b48c",
] as const;
export const COLOR_KEYWORD_HEX: Record<string, string> = {
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
  white: "#ffffff",
};
export const MOVE_OBJECTS_MIN_PADDING = 0;
export const MOVE_OBJECTS_MAX_PADDING = 400;
export const MOVE_OBJECTS_DEFAULT_PADDING = 0;
export const FRAME_FIT_MIN_PADDING = 0;
export const FRAME_FIT_MAX_PADDING = 240;
export const FRAME_FIT_DEFAULT_PADDING = 40;
export const VIEWPORT_SIDE_STACK_GAP = 32;

export type LayoutAlignment =
  | "left"
  | "center"
  | "right"
  | "top"
  | "middle"
  | "bottom";

export type BoardToolExecutorOptions = {
  boardId: string;
  userId: string;
  db?: Firestore;
};

export type BoardObjectDoc = {
  type: BoardObjectToolKind;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
  gridRows?: number | null;
  gridCols?: number | null;
  gridGap?: number | null;
  gridCellColors?: string[] | null;
  containerTitle?: string | null;
  gridSectionTitles?: string[] | null;
  gridSectionNotes?: string[] | null;
  updatedAt: string | null;
};
