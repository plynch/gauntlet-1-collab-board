import type { BoardObjectKind } from "@/features/boards/types";
import { GRID_CELL_SIZE } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type { ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

export const CURSOR_THROTTLE_MS = 120;
export const DRAG_THROTTLE_MS = 45;
export const CONTAINER_DRAG_THROTTLE_MS = 200;
export const DRAG_CLICK_SLOP_PX = 3;
export const STICKY_TEXT_SYNC_THROTTLE_MS = 180;
export const OBJECT_LABEL_MAX_LENGTH = 120;
export const PRESENCE_HEARTBEAT_MS = 10_000;
export const PRESENCE_TTL_MS = 15_000;
export const CURSOR_MIN_MOVE_DISTANCE = 2;
export const POSITION_WRITE_EPSILON = 0.1;
export const WRITE_METRICS_LOG_INTERVAL_MS = 15_000;
export const RESIZE_THROTTLE_MS = 45;
export const ROTATE_THROTTLE_MS = 45;
export const RESIZE_HANDLE_SIZE = 10;
export const SELECTED_OBJECT_HALO =
  "0 0 0 2px rgba(59, 130, 246, 0.45), 0 8px 14px rgba(0,0,0,0.14)";
export const OBJECT_SPAWN_STEP_PX = 20;
export const PANEL_SEPARATOR_COLOR = "var(--panel-separator)";
export const PANEL_SEPARATOR_WIDTH = 4;
export const LEFT_PANEL_WIDTH = 232;
export const RIGHT_PANEL_WIDTH = 238;
export const COLLAPSED_PANEL_WIDTH = 48;
export const PANEL_COLLAPSE_ANIMATION =
  "220ms cubic-bezier(0.22, 1, 0.36, 1)";
export const SNAP_TO_GRID_STORAGE_KEY = "collabboard-snap-to-grid-v1";
export const STICKY_TEXT_HOLD_DRAG_DELAY_MS = 120;
export const GRID_MAJOR_LINE_EVERY = 5;
export const GRID_MAJOR_SPACING = GRID_CELL_SIZE * GRID_MAJOR_LINE_EVERY;
export const GRID_SUPER_MAJOR_SPACING = GRID_MAJOR_SPACING * 10;
export const DUPLICATE_OFFSET_PX = 48;
export const BOARD_GRID_MINOR_LINE_COLOR = "var(--canvas-grid-minor)";
export const BOARD_GRID_MAJOR_LINE_COLOR = "var(--canvas-grid-major)";
export const BOARD_GRID_SUPER_MAJOR_LINE_COLOR = "var(--canvas-grid-super)";
export const SWOT_SECTION_COLORS = ["#a7f3d0", "#fecaca", "#a7f3d0", "#fecaca"];
export const SWOT_TEMPLATE_TITLE = "SWOT Analysis";
export const GRID_CONTAINER_DEFAULT_GAP = 2;
export const GRID_CONTAINER_MAX_ROWS = 6;
export const GRID_CONTAINER_MAX_COLS = 6;
export const CONNECTOR_HIT_PADDING = 16;
export const CONNECTOR_HANDLE_SIZE = 12;
export const CONNECTOR_DISCONNECTED_HANDLE_SIZE = 20;
export const CONNECTOR_SNAP_DISTANCE_PX = 20;
export const CONNECTOR_VIEWPORT_CULL_PADDING_PX = 240;
export const CONNECTOR_OBSTACLE_CULL_PADDING_PX = 96;

export const BOARD_TOOLS: BoardObjectKind[] = [
  "sticky",
  "text",
  "rect",
  "circle",
  "line",
  "gridContainer",
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
  "triangle",
  "star",
];

export const INITIAL_VIEWPORT: ViewportState = {
  x: 120,
  y: 80,
  scale: 1,
};
