"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type FormEvent as ReactFormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { User } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import type {
  BoardObject,
  BoardObjectKind,
  BoardPermissions,
  ConnectorAnchor,
  PresenceUser,
} from "@/features/boards/types";
import { getBoardCommandErrorMessage } from "@/features/ai/board-command";
import {
  getPathLength,
  getPathMidPoint,
  getPointSequenceBounds,
  getRouteEndDirections,
  toRoundedConnectorPath,
} from "@/features/boards/components/realtime-canvas/connector-routing-geometry";
import {
  OnlineUsersList,
  RemoteCursorLayer,
} from "@/features/boards/components/realtime-canvas/render-primitives";
import { calculateSelectionHudPosition } from "@/features/boards/components/realtime-canvas/selection-hud-layout";
import {
  areContainerMembershipPatchesEqual,
  getMembershipPatchFromObject,
  type ContainerMembershipPatch,
  useContainerMembership,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  getActivePresenceUsers,
  getPresenceLabel,
  getRemoteCursors,
  usePresenceClock,
} from "@/features/boards/components/realtime-canvas/use-presence-sync";
import {
  createRealtimeWriteMetrics,
  isWriteMetricsDebugEnabled,
} from "@/features/boards/lib/realtime-write-metrics";
import { GridContainer } from "@/features/ui/components/grid-container";
import { Input } from "@/features/ui/components/input";
import { IconButton } from "@/features/ui/components/icon-button";
import { Button } from "@/features/ui/components/button";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";

// Cost/perf tradeoff: keep cursors smooth while cutting high-frequency write churn.
const CURSOR_THROTTLE_MS = 120;
const DRAG_THROTTLE_MS = 45;
const DRAG_CLICK_SLOP_PX = 3;
const STICKY_TEXT_SYNC_THROTTLE_MS = 180;
const OBJECT_LABEL_MAX_LENGTH = 120;
const PRESENCE_HEARTBEAT_MS = 10_000;
const PRESENCE_TTL_MS = 15_000;
// Ignore tiny pointer jitter; remote users still see smooth cursor motion.
const CURSOR_MIN_MOVE_DISTANCE = 2;
// Quantize transform writes so near-identical pointer deltas coalesce.
const POSITION_WRITE_STEP = 0.5;
const POSITION_WRITE_EPSILON = 0.1;
const GEOMETRY_WRITE_EPSILON = 0.3;
const GEOMETRY_ROTATION_EPSILON_DEG = 0.35;
const MIN_SCALE = 0.05;
const MAX_SCALE = 2;
const ZOOM_SLIDER_MIN_PERCENT = Math.round(MIN_SCALE * 100);
const ZOOM_SLIDER_MAX_PERCENT = Math.round(MAX_SCALE * 100);
const ZOOM_BUTTON_STEP_PERCENT = 5;
const ZOOM_WHEEL_INTENSITY = 0.0065;
const ZOOM_WHEEL_MAX_EFFECTIVE_DELTA = 180;
const WRITE_METRICS_LOG_INTERVAL_MS = 15_000;
const AI_HELP_MESSAGE = [
  "🤖 Quick AI Help",
  "",
  "Try one of these:",
  "- Add a yellow sticky note that says 'User Research'",
  "- Create a blue rectangle at position 100,200",
  "- Move all the pink sticky notes to the right side",
  "- Create a SWOT analysis template",
  "",
  "You can ask in plain language anytime.",
  "Tip: Up/Down recalls command history.",
].join("\n");
const AI_WELCOME_MESSAGE = [
  "👋 Hi! I can edit this board with natural language.",
  "",
  "Examples:",
  "• Add a yellow sticky note that says 'User Research'",
  "• Create a blue rectangle at position 100,200",
  "• Move all the pink sticky notes to the right side",
  "• Create a SWOT analysis template",
  "",
  "Use normal language first. Type /help if you want quick examples ✨",
].join("\n");

type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

type PanState = {
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
};

type DragState = {
  objectIds: string[];
  initialGeometries: Record<string, ObjectGeometry>;
  startClientX: number;
  startClientY: number;
  lastSentAt: number;
  hasMoved: boolean;
  collapseToObjectIdOnClick: string | null;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type AiFooterResizeState = {
  startClientY: number;
  initialHeight: number;
};

type StickyTextHoldDragState = {
  objectId: string;
  startClientX: number;
  startClientY: number;
  timerId: number | null;
  started: boolean;
};

type BoardPoint = {
  x: number;
  y: number;
};

type ObjectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

type MarqueeSelectionMode = "add" | "remove";

type MarqueeSelectionState = {
  startPoint: BoardPoint;
  currentPoint: BoardPoint;
  mode: MarqueeSelectionMode;
};

type ResizeCorner = "nw" | "ne" | "sw" | "se";
type LineEndpoint = "start" | "end";
type ConnectorEndpoint = "from" | "to";

type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

type ObjectWriteOptions = {
  includeUpdatedAt?: boolean;
  force?: boolean;
  containerMembershipById?: Record<string, ContainerMembershipPatch>;
};

type CornerResizeState = {
  objectId: string;
  objectType: Exclude<
    BoardObjectKind,
    "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
  >;
  corner: ResizeCorner;
  startClientX: number;
  startClientY: number;
  initialGeometry: ObjectGeometry;
  lastSentAt: number;
};

type LineEndpointResizeState = {
  objectId: string;
  endpoint: LineEndpoint;
  fixedPoint: BoardPoint;
  handleHeight: number;
  lastSentAt: number;
};

type ConnectorEndpointDragState = {
  objectId: string;
  endpoint: ConnectorEndpoint;
  lastSentAt: number;
};

type ConnectorDraft = {
  fromObjectId: string | null;
  toObjectId: string | null;
  fromAnchor: ConnectorAnchor | null;
  toAnchor: ConnectorAnchor | null;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

type ResolvedConnectorEndpoint = {
  x: number;
  y: number;
  objectId: string | null;
  anchor: ConnectorAnchor | null;
  direction: BoardPoint | null;
  connected: boolean;
};

type RotateState = {
  objectId: string;
  centerPoint: BoardPoint;
  initialPointerAngleDeg: number;
  initialRotationDeg: number;
  lastSentAt: number;
};

type StickyTextSyncState = {
  pendingText: string | null;
  lastSentAt: number;
  lastSentText: string | null;
  timerId: number | null;
};

type GridContainerContentDraft = {
  containerTitle: string;
  sectionTitles: string[];
  sectionNotes: string[];
};

type ColorSwatch = {
  name: string;
  value: string;
};

const BOARD_TOOLS: BoardObjectKind[] = [
  "sticky",
  "rect",
  "circle",
  "gridContainer",
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
  "triangle",
  "star",
];
const RESIZE_THROTTLE_MS = 45;
const ROTATE_THROTTLE_MS = 45;
const RESIZE_HANDLE_SIZE = 10;
const LINE_MIN_LENGTH = 40;
const SELECTED_OBJECT_HALO =
  "0 0 0 2px rgba(59, 130, 246, 0.45), 0 8px 14px rgba(0,0,0,0.14)";
const OBJECT_SPAWN_STEP_PX = 20;
const PANEL_SEPARATOR_COLOR = "var(--panel-separator)";
const PANEL_SEPARATOR_WIDTH = 4;
const LEFT_PANEL_WIDTH = 232;
const RIGHT_PANEL_WIDTH = 238;
const COLLAPSED_PANEL_WIDTH = 48;
const PANEL_COLLAPSE_ANIMATION =
  "220ms cubic-bezier(0.22, 1, 0.36, 1)";
const AI_FOOTER_DEFAULT_HEIGHT = 220;
const AI_FOOTER_MIN_HEIGHT = 140;
const AI_FOOTER_MAX_HEIGHT = 460;
const AI_FOOTER_COLLAPSED_HEIGHT = 34;
const AI_FOOTER_HEIGHT_STORAGE_KEY = "collabboard-ai-footer-height-v1";
const SNAP_TO_GRID_STORAGE_KEY = "collabboard-snap-to-grid-v1";
const STICKY_TEXT_HOLD_DRAG_DELAY_MS = 120;
const GRID_CELL_SIZE = 20;
const GRID_MAJOR_LINE_EVERY = 5;
const GRID_MAJOR_SPACING = GRID_CELL_SIZE * GRID_MAJOR_LINE_EVERY;
const GRID_SUPER_MAJOR_SPACING = GRID_MAJOR_SPACING * 10;
const BOARD_GRID_MINOR_LINE_COLOR = "var(--canvas-grid-minor)";
const BOARD_GRID_MAJOR_LINE_COLOR = "var(--canvas-grid-major)";
const BOARD_GRID_SUPER_MAJOR_LINE_COLOR = "var(--canvas-grid-super)";
const BOARD_COLOR_SWATCHES: ColorSwatch[] = [
  { name: "Yellow", value: "#fde68a" },
  { name: "Orange", value: "#fdba74" },
  { name: "Red", value: "#fca5a5" },
  { name: "Pink", value: "#f9a8d4" },
  { name: "Purple", value: "#c4b5fd" },
  { name: "Blue", value: "#93c5fd" },
  { name: "Teal", value: "#99f6e4" },
  { name: "Green", value: "#86efac" },
  { name: "Gray", value: "#d1d5db" },
  { name: "Tan", value: "#d2b48c" },
];
const SWOT_SECTION_COLORS = ["#a7f3d0", "#fecaca", "#a7f3d0", "#fecaca"];
const DEFAULT_SWOT_SECTION_TITLES = [
  "Strengths",
  "Weaknesses",
  "Opportunities",
  "Threats",
] as const;
const SWOT_TEMPLATE_TITLE = "SWOT Analysis";
const GRID_CONTAINER_DEFAULT_GAP = 2;
const GRID_CONTAINER_MAX_ROWS = 6;
const GRID_CONTAINER_MAX_COLS = 6;

const CONNECTOR_MIN_SEGMENT_SIZE = 12;
const CONNECTOR_HIT_PADDING = 16;
const CONNECTOR_HANDLE_SIZE = 12;
const CONNECTOR_DISCONNECTED_HANDLE_SIZE = 20;
const CONNECTOR_SNAP_DISTANCE_PX = 20;

const CONNECTOR_TYPES: readonly BoardObjectKind[] = [
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
];
const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "top",
  "right",
  "bottom",
  "left",
];

const INITIAL_VIEWPORT: ViewportState = {
  x: 120,
  y: 80,
  scale: 1,
};

/**
 * Handles clamp scale.
 */
function clampScale(nextScale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
}

/**
 * Handles clamp ai footer height.
 */
function clampAiFooterHeight(nextHeight: number): number {
  return Math.min(
    AI_FOOTER_MAX_HEIGHT,
    Math.max(AI_FOOTER_MIN_HEIGHT, Math.round(nextHeight)),
  );
}

/**
 * Gets accelerated wheel zoom delta.
 */
function getAcceleratedWheelZoomDelta(deltaY: number): number {
  const magnitude = Math.abs(deltaY);
  const acceleration = 1 + Math.min(2.4, magnitude / 110);
  const acceleratedMagnitude = Math.min(
    ZOOM_WHEEL_MAX_EFFECTIVE_DELTA,
    magnitude * acceleration,
  );

  return Math.sign(deltaY) * acceleratedMagnitude;
}

/**
 * Handles to normalized rect.
 */
function toNormalizedRect(
  start: BoardPoint,
  end: BoardPoint,
): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y),
  };
}

/**
 * Gets spawn offset.
 */
function getSpawnOffset(index: number, step: number): BoardPoint {
  if (index <= 0) {
    return { x: 0, y: 0 };
  }

  const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
  const sideLength = ring * 2;
  const maxValueInRing = (ring * 2 + 1) ** 2 - 1;
  const delta = maxValueInRing - index;

  let gridX = 0;
  let gridY = 0;

  if (delta < sideLength) {
    gridX = ring - delta;
    gridY = -ring;
  } else if (delta < sideLength * 2) {
    const localDelta = delta - sideLength;
    gridX = -ring;
    gridY = -ring + localDelta;
  } else if (delta < sideLength * 3) {
    const localDelta = delta - sideLength * 2;
    gridX = -ring + localDelta;
    gridY = ring;
  } else {
    const localDelta = delta - sideLength * 3;
    gridX = ring;
    gridY = ring - localDelta;
  }

  return {
    x: gridX * step,
    y: gridY * step,
  };
}

/**
 * Creates chat message id.
 */
function createChatMessageId(prefix: "u" | "a"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Gets string.
 */
function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Gets nullable string.
 */
function getNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  return null;
}

/**
 * Gets number.
 */
function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Gets timestamp millis.
 */
function getTimestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return null;
}

/**
 * Gets finite number.
 */
function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Gets grid dimension.
 */
function getGridDimension(
  value: unknown,
  fallback: number | null,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      Math.max(GRID_CONTAINER_MAX_ROWS, GRID_CONTAINER_MAX_COLS),
      Math.floor(value),
    ),
  );
}

/**
 * Gets grid gap.
 */
function getGridGap(value: unknown, fallback: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(24, Math.round(value)));
}

/**
 * Gets non negative integer.
 */
function getNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const floored = Math.floor(value);
  return floored >= 0 ? floored : null;
}

/**
 * Gets grid cell colors.
 */
function getGridCellColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value.filter(
    (item): item is string => typeof item === "string",
  );
  return colors.length > 0 ? colors : null;
}

/**
 * Gets string array.
 */
function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  return values.length > 0 ? values : null;
}

/**
 * Gets default section titles.
 */
function getDefaultSectionTitles(rows: number, cols: number): string[] {
  const count = Math.max(1, rows * cols);
  if (rows === 2 && cols === 2) {
    return Array.from(
      { length: count },
      (_, index) =>
        DEFAULT_SWOT_SECTION_TITLES[index] ?? `Section ${index + 1}`,
    );
  }

  return Array.from({ length: count }, (_, index) => `Section ${index + 1}`);
}

/**
 * Handles normalize section values.
 */
function normalizeSectionValues(
  values: string[] | null | undefined,
  count: number,
  fallback: (index: number) => string,
  maxLength: number,
): string[] {
  return Array.from({ length: count }, (_, index) => {
    const value = values?.[index]?.trim() ?? "";
    if (value.length === 0) {
      return fallback(index).slice(0, maxLength);
    }

    return value.slice(0, maxLength);
  });
}

/**
 * Gets timestamp iso.
 */
function getTimestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

/**
 * Handles hash to color.
 */
function hashToColor(input: string): string {
  const palette = [
    "#2563eb",
    "#0ea5e9",
    "#0891b2",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#7c3aed",
    "#db2777",
  ];

  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }

  return palette[Math.abs(hash) % palette.length];
}

/**
 * Returns whether board object kind is true.
 */
function isBoardObjectKind(value: unknown): value is BoardObjectKind {
  return (
    value === "sticky" ||
    value === "rect" ||
    value === "circle" ||
    value === "gridContainer" ||
    value === "line" ||
    value === "connectorUndirected" ||
    value === "connectorArrow" ||
    value === "connectorBidirectional" ||
    value === "triangle" ||
    value === "star"
  );
}

/**
 * Returns whether connector kind is true.
 */
function isConnectorKind(value: BoardObjectKind): boolean {
  return CONNECTOR_TYPES.includes(value);
}

/**
 * Returns whether connectable shape kind is true.
 */
function isConnectableShapeKind(
  value: BoardObjectKind,
): value is Exclude<
  BoardObjectKind,
  "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
> {
  return value !== "line" && !isConnectorKind(value);
}

/**
 * Gets default object size.
 */
function getDefaultObjectSize(kind: BoardObjectKind): {
  width: number;
  height: number;
} {
  if (kind === "sticky") {
    return { width: 220, height: 170 };
  }

  if (kind === "rect") {
    return { width: 240, height: 150 };
  }

  if (kind === "circle") {
    return { width: 170, height: 170 };
  }

  if (kind === "gridContainer") {
    return { width: 708, height: 468 };
  }

  if (kind === "triangle") {
    return { width: 180, height: 170 };
  }

  if (kind === "star") {
    return { width: 180, height: 180 };
  }

  if (isConnectorKind(kind)) {
    return { width: 220, height: 120 };
  }

  return { width: 240, height: 64 };
}

/**
 * Gets minimum object size.
 */
function getMinimumObjectSize(kind: BoardObjectKind): {
  width: number;
  height: number;
} {
  if (kind === "sticky") {
    return { width: 140, height: 100 };
  }

  if (kind === "rect") {
    return { width: 80, height: 60 };
  }

  if (kind === "circle") {
    return { width: 80, height: 80 };
  }

  if (kind === "gridContainer") {
    return { width: 180, height: 120 };
  }

  if (kind === "triangle" || kind === "star") {
    return { width: 80, height: 80 };
  }

  if (isConnectorKind(kind)) {
    return { width: 1, height: 1 };
  }

  return { width: LINE_MIN_LENGTH, height: 32 };
}

/**
 * Gets default object color.
 */
function getDefaultObjectColor(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "#fde68a";
  }

  if (kind === "rect") {
    return "#93c5fd";
  }

  if (kind === "circle") {
    return "#86efac";
  }

  if (kind === "gridContainer") {
    return "#e2e8f0";
  }

  if (kind === "triangle") {
    return "#c4b5fd";
  }

  if (kind === "star") {
    return "#fcd34d";
  }

  if (kind === "connectorUndirected") {
    return "#334155";
  }

  if (kind === "connectorArrow") {
    return "#1d4ed8";
  }

  if (kind === "connectorBidirectional") {
    return "#0f766e";
  }

  return "#1f2937";
}

/**
 * Handles clamp rgb channel.
 */
function clampRgbChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

/**
 * Parses hex color.
 */
function parseHexColor(color: string): {
  red: number;
  green: number;
  blue: number;
} | null {
  const normalized = color.trim();
  const compact = normalized.startsWith("#")
    ? normalized.slice(1)
    : normalized;
  if (!/^[\da-fA-F]{3}([\da-fA-F]{3})?$/.test(compact)) {
    return null;
  }

  if (compact.length === 3) {
    return {
      red: Number.parseInt(compact[0] + compact[0], 16),
      green: Number.parseInt(compact[1] + compact[1], 16),
      blue: Number.parseInt(compact[2] + compact[2], 16),
    };
  }

  return {
    red: Number.parseInt(compact.slice(0, 2), 16),
    green: Number.parseInt(compact.slice(2, 4), 16),
    blue: Number.parseInt(compact.slice(4, 6), 16),
  };
}

/**
 * Handles rgb to hex color.
 */
function rgbToHexColor(red: number, green: number, blue: number): string {
  return `#${clampRgbChannel(red).toString(16).padStart(2, "0")}${clampRgbChannel(
    green,
  )
    .toString(16)
    .padStart(2, "0")}${clampRgbChannel(blue).toString(16).padStart(2, "0")}`;
}

/**
 * Handles mix hex colors.
 */
function mixHexColors(baseColor: string, targetColor: string, ratio: number): string {
  const base = parseHexColor(baseColor);
  const target = parseHexColor(targetColor);
  if (!base || !target) {
    return baseColor;
  }

  const safeRatio = Math.min(1, Math.max(0, ratio));
  const inverse = 1 - safeRatio;

  return rgbToHexColor(
    base.red * inverse + target.red * safeRatio,
    base.green * inverse + target.green * safeRatio,
    base.blue * inverse + target.blue * safeRatio,
  );
}

/**
 * Gets readable text color for a background color.
 */
function getReadableTextColor(backgroundColor: string): string {
  const parsed = parseHexColor(backgroundColor);
  if (!parsed) {
    return "#f8fafc";
  }

  const luminance =
    (0.299 * parsed.red + 0.587 * parsed.green + 0.114 * parsed.blue) / 255;
  return luminance > 0.6 ? "#0f172a" : "#f8fafc";
}

/**
 * Gets rendered object color for current theme.
 */
function getRenderedObjectColor(
  color: string,
  type: BoardObjectKind,
  resolvedTheme: "light" | "dark",
): string {
  if (resolvedTheme === "light") {
    return color;
  }

  if (isConnectorKind(type) || type === "line") {
    return mixHexColors(color, "#e2e8f0", 0.35);
  }

  if (type === "gridContainer") {
    return mixHexColors(color, "#0f172a", 0.22);
  }

  return mixHexColors(color, "#0b1020", 0.34);
}

/**
 * Gets object label.
 */
function getObjectLabel(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "Sticky";
  }

  if (kind === "rect") {
    return "Rectangle";
  }

  if (kind === "circle") {
    return "Circle";
  }

  if (kind === "gridContainer") {
    return "Grid container";
  }

  if (kind === "triangle") {
    return "Triangle";
  }

  if (kind === "star") {
    return "Star";
  }

  if (kind === "connectorUndirected") {
    return "Connector";
  }

  if (kind === "connectorArrow") {
    return "Arrow connector";
  }

  if (kind === "connectorBidirectional") {
    return "Double-arrow connector";
  }

  return "Line";
}

/**
 * Returns whether object type is a background container.
 */
function isBackgroundContainerType(type: BoardObjectKind): boolean {
  return type === "gridContainer";
}

/**
 * Gets render layer rank.
 */
function getRenderLayerRank(type: BoardObjectKind): number {
  return isBackgroundContainerType(type) ? 0 : 1;
}

/**
 * Returns whether object supports selection hud color updates.
 */
function canUseSelectionHudColor(objectItem: BoardObject): boolean {
  return objectItem.type !== "line";
}

/**
 * Returns whether object type supports label text in-canvas.
 */
function isLabelEditableObjectType(type: BoardObjectKind): boolean {
  return (
    type === "rect" ||
    type === "circle" ||
    type === "triangle" ||
    type === "star" ||
    type === "line" ||
    isConnectorKind(type)
  );
}

/**
 * Handles to radians.
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Handles to degrees.
 */
function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Handles round to step.
 */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Handles snap to grid.
 */
function snapToGrid(value: number): number {
  return roundToStep(value, GRID_CELL_SIZE);
}

/**
 * Returns whether object should snap to grid is true.
 */
function isSnapEligibleObjectType(type: BoardObjectKind): boolean {
  return (
    type === "sticky" ||
    type === "rect" ||
    type === "circle" ||
    type === "triangle" ||
    type === "star" ||
    type === "line" ||
    type === "gridContainer"
  );
}

/**
 * Handles to write point.
 */
function toWritePoint(point: BoardPoint): BoardPoint {
  return {
    x: roundToStep(point.x, POSITION_WRITE_STEP),
    y: roundToStep(point.y, POSITION_WRITE_STEP),
  };
}

/**
 * Gets distance.
 */
function getDistance(left: BoardPoint, right: BoardPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Handles are points close.
 */
function arePointsClose(
  left: BoardPoint,
  right: BoardPoint,
  epsilon: number,
): boolean {
  return (
    Math.abs(left.x - right.x) <= epsilon &&
    Math.abs(left.y - right.y) <= epsilon
  );
}

/**
 * Handles normalize rotation deg.
 */
function normalizeRotationDeg(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

/**
 * Gets rotation delta.
 */
function getRotationDelta(
  leftRotationDeg: number,
  rightRotationDeg: number,
): number {
  const normalizedLeft = normalizeRotationDeg(leftRotationDeg);
  const normalizedRight = normalizeRotationDeg(rightRotationDeg);
  const rawDelta = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(rawDelta, 360 - rawDelta);
}

/**
 * Handles are geometries close.
 */
function areGeometriesClose(
  leftGeometry: ObjectGeometry,
  rightGeometry: ObjectGeometry,
): boolean {
  return (
    Math.abs(leftGeometry.x - rightGeometry.x) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.y - rightGeometry.y) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.width - rightGeometry.width) <=
      GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.height - rightGeometry.height) <=
      GEOMETRY_WRITE_EPSILON &&
    getRotationDelta(leftGeometry.rotationDeg, rightGeometry.rotationDeg) <=
      GEOMETRY_ROTATION_EPSILON_DEG
  );
}

/**
 * Handles has meaningful rotation.
 */
function hasMeaningfulRotation(rotationDeg: number): boolean {
  const normalized = normalizeRotationDeg(rotationDeg);
  const distanceToZero = Math.min(normalized, 360 - normalized);
  return distanceToZero > 0.25;
}

/**
 * Gets rotated bounds.
 */
function getRotatedBounds(geometry: ObjectGeometry): ObjectBounds {
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const corners = [
    { x: -halfWidth, y: -halfHeight },
    { x: halfWidth, y: -halfHeight },
    { x: halfWidth, y: halfHeight },
    { x: -halfWidth, y: halfHeight },
  ];

  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  corners.forEach((corner) => {
    const rotatedX = centerX + corner.x * cos - corner.y * sin;
    const rotatedY = centerY + corner.x * sin + corner.y * cos;
    left = Math.min(left, rotatedX);
    right = Math.max(right, rotatedX);
    top = Math.min(top, rotatedY);
    bottom = Math.max(bottom, rotatedY);
  });

  return { left, right, top, bottom };
}

/**
 * Gets object visual bounds.
 */
function getObjectVisualBounds(
  type: BoardObjectKind,
  geometry: ObjectGeometry,
): ObjectBounds {
  if (type === "line") {
    const endpoints = getLineEndpoints(geometry);
    return {
      left: Math.min(endpoints.start.x, endpoints.end.x),
      right: Math.max(endpoints.start.x, endpoints.end.x),
      top: Math.min(endpoints.start.y, endpoints.end.y),
      bottom: Math.max(endpoints.start.y, endpoints.end.y),
    };
  }

  return getRotatedBounds(geometry);
}

/**
 * Handles merge bounds.
 */
function mergeBounds(bounds: ObjectBounds[]): ObjectBounds | null {
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce((combined, current) => ({
    left: Math.min(combined.left, current.left),
    right: Math.max(combined.right, current.right),
    top: Math.min(combined.top, current.top),
    bottom: Math.max(combined.bottom, current.bottom),
  }));
}

/**
 * Gets line endpoints.
 */
function getLineEndpoints(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength,
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength,
    },
  };
}

/**
 * Gets line endpoint offsets.
 */
function getLineEndpointOffsets(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.width / 2;
  const centerY = geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength,
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength,
    },
  };
}

/**
 * Handles rotate point around center.
 */
function rotatePointAroundCenter(
  point: BoardPoint,
  center: BoardPoint,
  rotationDeg: number,
): BoardPoint {
  const radians = toRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const offsetX = point.x - center.x;
  const offsetY = point.y - center.y;

  return {
    x: center.x + offsetX * cos - offsetY * sin,
    y: center.y + offsetX * sin + offsetY * cos,
  };
}

/**
 * Handles rotate vector.
 */
function rotateVector(vector: BoardPoint, rotationDeg: number): BoardPoint {
  if (Math.abs(rotationDeg) < 0.001) {
    return vector;
  }

  const radians = toRadians(rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    x: vector.x * cos - vector.y * sin,
    y: vector.x * sin + vector.y * cos,
  };
}

/**
 * Gets anchor direction vector.
 */
function getAnchorDirectionVector(anchor: ConnectorAnchor): BoardPoint {
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }
  if (anchor === "right") {
    return { x: 1, y: 0 };
  }
  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }
  return { x: -1, y: 0 };
}

/**
 * Gets anchor direction for geometry.
 */
function getAnchorDirectionForGeometry(
  anchor: ConnectorAnchor,
  geometry: ObjectGeometry,
): BoardPoint {
  return rotateVector(getAnchorDirectionVector(anchor), geometry.rotationDeg);
}

/**
 * Gets ray box intersection.
 */
function getRayBoxIntersection(
  direction: BoardPoint,
  halfWidth: number,
  halfHeight: number,
): BoardPoint {
  const absDx = Math.abs(direction.x);
  const absDy = Math.abs(direction.y);
  const tX = absDx <= 0.000001 ? Number.POSITIVE_INFINITY : halfWidth / absDx;
  const tY = absDy <= 0.000001 ? Number.POSITIVE_INFINITY : halfHeight / absDy;
  const t = Math.min(tX, tY);

  if (!Number.isFinite(t)) {
    return { x: 0, y: 0 };
  }

  return {
    x: direction.x * t,
    y: direction.y * t,
  };
}

/**
 * Gets ray ellipse intersection.
 */
function getRayEllipseIntersection(
  direction: BoardPoint,
  halfWidth: number,
  halfHeight: number,
): BoardPoint {
  const denominator =
    (direction.x * direction.x) / (halfWidth * halfWidth) +
    (direction.y * direction.y) / (halfHeight * halfHeight);

  if (denominator <= 0.000001) {
    return { x: 0, y: 0 };
  }

  const t = 1 / Math.sqrt(denominator);
  return {
    x: direction.x * t,
    y: direction.y * t,
  };
}

/**
 * Handles cross2d.
 */
function cross2d(left: BoardPoint, right: BoardPoint): number {
  return left.x * right.y - left.y * right.x;
}

/**
 * Gets ray polygon intersection.
 */
function getRayPolygonIntersection(
  direction: BoardPoint,
  polygonPoints: BoardPoint[],
): BoardPoint | null {
  if (polygonPoints.length < 3) {
    return null;
  }

  let bestT = Number.POSITIVE_INFINITY;
  let bestPoint: BoardPoint | null = null;

  for (let index = 0; index < polygonPoints.length; index += 1) {
    const start = polygonPoints[index];
    const end = polygonPoints[(index + 1) % polygonPoints.length];
    const segmentVector = {
      x: end.x - start.x,
      y: end.y - start.y,
    };
    const denominator = cross2d(direction, segmentVector);

    if (Math.abs(denominator) <= 0.000001) {
      continue;
    }

    const t = cross2d(start, segmentVector) / denominator;
    const u = cross2d(start, direction) / denominator;
    if (t < 0 || u < -0.000001 || u > 1.000001) {
      continue;
    }

    if (t < bestT) {
      bestT = t;
      bestPoint = {
        x: direction.x * t,
        y: direction.y * t,
      };
    }
  }

  return bestPoint;
}

/**
 * Handles to local polygon point.
 */
function toLocalPolygonPoint(
  u: number,
  v: number,
  width: number,
  height: number,
): BoardPoint {
  return {
    x: (u - 0.5) * width,
    y: (v - 0.5) * height,
  };
}

const TRIANGLE_POLYGON_NORMALIZED: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.06],
  [0.94, 0.92],
  [0.06, 0.92],
];

const STAR_POLYGON_NORMALIZED: ReadonlyArray<readonly [number, number]> = [
  [0.5, 0.07],
  [0.61, 0.38],
  [0.95, 0.38],
  [0.67, 0.57],
  [0.78, 0.9],
  [0.5, 0.7],
  [0.22, 0.9],
  [0.33, 0.57],
  [0.05, 0.38],
  [0.39, 0.38],
];

/**
 * Gets anchor point for geometry.
 */
function getAnchorPointForGeometry(
  geometry: ObjectGeometry,
  anchor: ConnectorAnchor,
  shapeType:
    | "sticky"
    | "rect"
    | "circle"
    | "gridContainer"
    | "triangle"
    | "star" = "rect",
): BoardPoint {
  const center = {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
  const halfWidth = geometry.width / 2;
  const halfHeight = geometry.height / 2;
  const direction = getAnchorDirectionVector(anchor);
  let localPoint: BoardPoint;

  if (shapeType === "circle") {
    localPoint = getRayEllipseIntersection(direction, halfWidth, halfHeight);
  } else if (shapeType === "triangle" || shapeType === "star") {
    const normalizedPoints =
      shapeType === "triangle"
        ? TRIANGLE_POLYGON_NORMALIZED
        : STAR_POLYGON_NORMALIZED;
    const polygonPoints = normalizedPoints.map(([u, v]) =>
      toLocalPolygonPoint(u, v, geometry.width, geometry.height),
    );
    localPoint =
      getRayPolygonIntersection(direction, polygonPoints) ??
      getRayBoxIntersection(direction, halfWidth, halfHeight);
  } else {
    localPoint = getRayBoxIntersection(direction, halfWidth, halfHeight);
  }

  const unrotatedPoint = {
    x: center.x + localPoint.x,
    y: center.y + localPoint.y,
  };

  if (Math.abs(geometry.rotationDeg) < 0.001) {
    return unrotatedPoint;
  }

  return rotatePointAroundCenter(unrotatedPoint, center, geometry.rotationDeg);
}

/**
 * Gets connector bounds from endpoints.
 */
function getConnectorBoundsFromEndpoints(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  padding = 0,
): ObjectBounds {
  return {
    left: Math.min(fromPoint.x, toPoint.x) - padding,
    right: Math.max(fromPoint.x, toPoint.x) + padding,
    top: Math.min(fromPoint.y, toPoint.y) - padding,
    bottom: Math.max(fromPoint.y, toPoint.y) + padding,
  };
}

/**
 * Handles to connector geometry from endpoints.
 */
function toConnectorGeometryFromEndpoints(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
): ObjectGeometry {
  const bounds = getConnectorBoundsFromEndpoints(fromPoint, toPoint);
  return {
    x: bounds.left,
    y: bounds.top,
    width: Math.max(CONNECTOR_MIN_SEGMENT_SIZE, bounds.right - bounds.left),
    height: Math.max(CONNECTOR_MIN_SEGMENT_SIZE, bounds.bottom - bounds.top),
    rotationDeg: 0,
  };
}

type ConnectorRoutingObstacle = {
  objectId: string;
  bounds: ObjectBounds;
};

type ConnectorRouteGeometry = {
  points: BoardPoint[];
  bounds: ObjectBounds;
  midPoint: BoardPoint;
  startDirection: BoardPoint;
  endDirection: BoardPoint;
};

/**
 * Handles inflate object bounds.
 */
function inflateObjectBounds(
  bounds: ObjectBounds,
  padding: number,
): ObjectBounds {
  return {
    left: bounds.left - padding,
    right: bounds.right + padding,
    top: bounds.top - padding,
    bottom: bounds.bottom + padding,
  };
}

/**
 * Handles segment intersects bounds.
 */
function segmentIntersectsBounds(
  start: BoardPoint,
  end: BoardPoint,
  bounds: ObjectBounds,
): boolean {
  const epsilon = 0.8;
  const isHorizontal = Math.abs(start.y - end.y) <= 0.001;
  const isVertical = Math.abs(start.x - end.x) <= 0.001;

  if (isHorizontal) {
    const y = start.y;
    if (y <= bounds.top + epsilon || y >= bounds.bottom - epsilon) {
      return false;
    }

    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    return right > bounds.left + epsilon && left < bounds.right - epsilon;
  }

  if (isVertical) {
    const x = start.x;
    if (x <= bounds.left + epsilon || x >= bounds.right - epsilon) {
      return false;
    }

    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    return bottom > bounds.top + epsilon && top < bounds.bottom - epsilon;
  }

  return false;
}

/**
 * Handles count route intersections.
 */
function countRouteIntersections(
  points: BoardPoint[],
  obstacles: ConnectorRoutingObstacle[],
): number {
  if (points.length < 2 || obstacles.length === 0) {
    return 0;
  }

  let hits = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const segmentStart = points[index];
    const segmentEnd = points[index + 1];
    obstacles.forEach((obstacle) => {
      if (segmentIntersectsBounds(segmentStart, segmentEnd, obstacle.bounds)) {
        hits += 1;
      }
    });
  }
  return hits;
}

/**
 * Handles simplify route points.
 */
function simplifyRoutePoints(points: BoardPoint[]): BoardPoint[] {
  if (points.length <= 2) {
    return points;
  }

  const deduped: BoardPoint[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (!previous || getDistance(previous, point) > 0.1) {
      deduped.push(point);
    }
  });

  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: BoardPoint[] = [deduped[0]];
  for (let index = 1; index < deduped.length - 1; index += 1) {
    const previous = simplified[simplified.length - 1];
    const current = deduped[index];
    const next = deduped[index + 1];

    const prevToCurrentX = current.x - previous.x;
    const prevToCurrentY = current.y - previous.y;
    const currentToNextX = next.x - current.x;
    const currentToNextY = next.y - current.y;
    const collinearX =
      Math.abs(prevToCurrentX) <= 0.001 && Math.abs(currentToNextX) <= 0.001;
    const collinearY =
      Math.abs(prevToCurrentY) <= 0.001 && Math.abs(currentToNextY) <= 0.001;

    if (collinearX || collinearY) {
      continue;
    }

    simplified.push(current);
  }
  simplified.push(deduped[deduped.length - 1]);

  return simplified;
}

/**
 * Gets anchor direction.
 */
function getAnchorDirection(anchor: ConnectorAnchor | null): BoardPoint | null {
  if (anchor === "top") {
    return { x: 0, y: -1 };
  }
  if (anchor === "right") {
    return { x: 1, y: 0 };
  }
  if (anchor === "bottom") {
    return { x: 0, y: 1 };
  }
  if (anchor === "left") {
    return { x: -1, y: 0 };
  }
  return null;
}

/**
 * Handles score endpoint direction alignment.
 */
function scoreEndpointDirectionAlignment(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  fromDirection: BoardPoint | null,
  toDirection: BoardPoint | null,
): number {
  const deltaX = toPoint.x - fromPoint.x;
  const deltaY = toPoint.y - fromPoint.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance <= 0.0001) {
    return 0;
  }

  let penalty = 0;
  const forwardX = deltaX / distance;
  const forwardY = deltaY / distance;

  if (fromDirection) {
    const fromAlignment =
      fromDirection.x * forwardX + fromDirection.y * forwardY;
    if (fromAlignment < 0) {
      penalty += 2500 + Math.abs(fromAlignment) * 1400;
    } else {
      penalty += (1 - fromAlignment) * 120;
    }
  }

  if (toDirection) {
    const toForwardX = -forwardX;
    const toForwardY = -forwardY;
    const toAlignment = toDirection.x * toForwardX + toDirection.y * toForwardY;
    if (toAlignment < 0) {
      penalty += 2500 + Math.abs(toAlignment) * 1400;
    } else {
      penalty += (1 - toAlignment) * 120;
    }
  }

  return penalty;
}

/**
 * Creates orthogonal route candidates.
 */
function createOrthogonalRouteCandidates(
  fromPoint: BoardPoint,
  toPoint: BoardPoint,
  detourDistance: number,
): BoardPoint[][] {
  const routes: BoardPoint[][] = [];
  const middleX = (fromPoint.x + toPoint.x) / 2;
  const middleY = (fromPoint.y + toPoint.y) / 2;
  const leftX = Math.min(fromPoint.x, toPoint.x) - detourDistance;
  const rightX = Math.max(fromPoint.x, toPoint.x) + detourDistance;
  const topY = Math.min(fromPoint.y, toPoint.y) - detourDistance;
  const bottomY = Math.max(fromPoint.y, toPoint.y) + detourDistance;

  if (
    Math.abs(fromPoint.x - toPoint.x) <= 0.001 ||
    Math.abs(fromPoint.y - toPoint.y) <= 0.001
  ) {
    routes.push([fromPoint, toPoint]);
  }

  routes.push(
    [fromPoint, { x: toPoint.x, y: fromPoint.y }, toPoint],
    [fromPoint, { x: fromPoint.x, y: toPoint.y }, toPoint],
    [
      fromPoint,
      { x: middleX, y: fromPoint.y },
      { x: middleX, y: toPoint.y },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: middleY },
      { x: toPoint.x, y: middleY },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: topY },
      { x: toPoint.x, y: topY },
      toPoint,
    ],
    [
      fromPoint,
      { x: fromPoint.x, y: bottomY },
      { x: toPoint.x, y: bottomY },
      toPoint,
    ],
    [
      fromPoint,
      { x: leftX, y: fromPoint.y },
      { x: leftX, y: toPoint.y },
      toPoint,
    ],
    [
      fromPoint,
      { x: rightX, y: fromPoint.y },
      { x: rightX, y: toPoint.y },
      toPoint,
    ],
  );

  const unique = new Map<string, BoardPoint[]>();
  routes.forEach((candidate) => {
    const simplified = simplifyRoutePoints(candidate);
    const key = simplified
      .map(
        (point) =>
          `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`,
      )
      .join("|");
    if (!unique.has(key)) {
      unique.set(key, simplified);
    }
  });

  return Array.from(unique.values());
}

/**
 * Handles score connector route.
 */
function scoreConnectorRoute(
  points: BoardPoint[],
  obstacles: ConnectorRoutingObstacle[],
): number {
  const intersections = countRouteIntersections(points, obstacles);
  const bends = Math.max(0, points.length - 2);
  const length = getPathLength(points);
  return intersections * 1_000_000 + bends * 120 + length;
}

/**
 * Builds connector route geometry.
 */
function buildConnectorRouteGeometry(options: {
  from: ResolvedConnectorEndpoint;
  to: ResolvedConnectorEndpoint;
  obstacles: ConnectorRoutingObstacle[];
  padding: number;
}): ConnectorRouteGeometry {
  const start = { x: options.from.x, y: options.from.y };
  const end = { x: options.to.x, y: options.to.y };
  const fromDirection =
    options.from.direction ?? getAnchorDirection(options.from.anchor);
  const toDirection =
    options.to.direction ?? getAnchorDirection(options.to.anchor);
  const leadDistance = 30;

  const startLead = fromDirection
    ? {
        x: start.x + fromDirection.x * leadDistance,
        y: start.y + fromDirection.y * leadDistance,
      }
    : null;
  const endLead = toDirection
    ? {
        x: end.x + toDirection.x * leadDistance,
        y: end.y + toDirection.y * leadDistance,
      }
    : null;

  const routeStart = startLead ?? start;
  const routeEnd = endLead ?? end;
  const detourDistance = Math.max(
    52,
    Math.min(
      200,
      48 +
        Math.max(
          Math.abs(routeStart.x - routeEnd.x),
          Math.abs(routeStart.y - routeEnd.y),
        ) *
          0.2,
    ),
  );
  const bridgeCandidates = createOrthogonalRouteCandidates(
    routeStart,
    routeEnd,
    detourDistance,
  );

  const fullCandidates = bridgeCandidates.map((bridge) =>
    simplifyRoutePoints([
      start,
      ...(startLead ? [startLead] : []),
      ...bridge.slice(1, -1),
      ...(endLead ? [endLead] : []),
      end,
    ]),
  );

  if (fullCandidates.length === 0) {
    fullCandidates.push([start, end]);
  }

  let bestPoints = fullCandidates[0];
  let bestScore = scoreConnectorRoute(bestPoints, options.obstacles);
  for (let index = 1; index < fullCandidates.length; index += 1) {
    const candidate = fullCandidates[index];
    const candidateScore = scoreConnectorRoute(candidate, options.obstacles);
    if (candidateScore < bestScore) {
      bestScore = candidateScore;
      bestPoints = candidate;
    }
  }

  const bounds = getPointSequenceBounds(bestPoints, options.padding);
  const midPoint = getPathMidPoint(bestPoints);
  const directions = getRouteEndDirections(bestPoints);

  return {
    points: bestPoints,
    bounds,
    midPoint,
    startDirection: directions.startDirection,
    endDirection: directions.endDirection,
  };
}

/**
 * Handles tool icon.
 */
function ToolIcon({ kind }: { kind: BoardObjectKind }) {
  if (kind === "sticky") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="1.8"
          fill="#fde68a"
          stroke="#b08928"
        />
        <rect
          x="3.2"
          y="3.2"
          width="9.6"
          height="2.2"
          rx="0.8"
          fill="#fcd34d"
        />
        <line
          x1="4.1"
          y1="7.2"
          x2="11.9"
          y2="7.2"
          stroke="#9a7b19"
          strokeWidth="0.9"
        />
        <line
          x1="4.1"
          y1="9.4"
          x2="10.4"
          y2="9.4"
          stroke="#9a7b19"
          strokeWidth="0.9"
        />
      </svg>
    );
  }

  if (kind === "rect") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="3"
          width="12"
          height="10"
          rx="0.5"
          fill="#93c5fd"
          stroke="#1d4ed8"
        />
      </svg>
    );
  }

  if (kind === "circle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="#86efac" stroke="#15803d" />
      </svg>
    );
  }

  if (kind === "gridContainer") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="2"
          y="2"
          width="12"
          height="12"
          rx="1.2"
          fill="#f8fafc"
          stroke="#475569"
        />
        <rect
          x="3.2"
          y="3.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#d1fae5"
        />
        <rect
          x="8.2"
          y="3.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#fee2e2"
        />
        <rect
          x="3.2"
          y="8.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#dbeafe"
        />
        <rect
          x="8.2"
          y="8.2"
          width="4.6"
          height="4.6"
          rx="0.6"
          fill="#fef3c7"
        />
      </svg>
    );
  }

  if (kind === "connectorUndirected") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line x1="3" y1="8" x2="13" y2="8" stroke="#334155" strokeWidth="2.2" />
        <circle
          cx="3"
          cy="8"
          r="1.6"
          fill="white"
          stroke="#334155"
          strokeWidth="1"
        />
        <circle
          cx="13"
          cy="8"
          r="1.6"
          fill="white"
          stroke="#334155"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (kind === "connectorArrow") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line
          x1="2.8"
          y1="8"
          x2="12.3"
          y2="8"
          stroke="#1d4ed8"
          strokeWidth="2.2"
        />
        <polygon points="12.3,5.5 14.6,8 12.3,10.5" fill="#1d4ed8" />
        <circle
          cx="2.8"
          cy="8"
          r="1.3"
          fill="white"
          stroke="#1d4ed8"
          strokeWidth="1"
        />
      </svg>
    );
  }

  if (kind === "connectorBidirectional") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <line
          x1="3.6"
          y1="8"
          x2="12.4"
          y2="8"
          stroke="#0f766e"
          strokeWidth="2.2"
        />
        <polygon points="3.6,5.6 1.4,8 3.6,10.4" fill="#0f766e" />
        <polygon points="12.4,5.6 14.6,8 12.4,10.4" fill="#0f766e" />
      </svg>
    );
  }

  if (kind === "triangle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <polygon
          points="8,2 14,13 2,13"
          fill="#c4b5fd"
          stroke="#6d28d9"
          strokeWidth="1.1"
        />
      </svg>
    );
  }

  if (kind === "star") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <polygon
          points="8,1.8 9.9,6.1 14.5,6.1 10.8,8.9 12.3,13.7 8,10.8 3.7,13.7 5.2,8.9 1.5,6.1 6.1,6.1"
          fill="#fcd34d"
          stroke="#92400e"
          strokeWidth="1.05"
        />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line
        x1="2.5"
        y1="8"
        x2="13.5"
        y2="8"
        stroke="#1f2937"
        strokeWidth="2.5"
      />
    </svg>
  );
}

/**
 * Handles color swatch picker.
 */
function ColorSwatchPicker({
  currentColor,
  onSelectColor,
}: {
  currentColor: string | null;
  onSelectColor: (nextColor: string) => void;
}) {
  const currentColorKey = currentColor ? currentColor.toLowerCase() : null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "nowrap",
        gap: 6,
        alignItems: "center",
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {BOARD_COLOR_SWATCHES.map((swatch) => {
        const isSelected =
          currentColorKey !== null &&
          swatch.value.toLowerCase() === currentColorKey;

        return (
          <button
            key={swatch.value}
            type="button"
            onClick={() => onSelectColor(swatch.value)}
            title={swatch.name}
            aria-label={`Set color to ${swatch.name}`}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: isSelected
                ? "2px solid var(--text)"
                : "1px solid var(--border)",
              boxSizing: "border-box",
              background: swatch.value,
              cursor: "pointer",
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Handles trash icon.
 */
function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9m-7.8 0 .4 8.2a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.4-8.2m-4.9 0V3.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7v1.3"
        stroke="#7f1d1d"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Handles briefcase icon.
 */
function BriefcaseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="2"
        y="4.6"
        width="12"
        height="8.8"
        rx="1.5"
        fill="#e0e7ff"
        stroke="#3730a3"
      />
      <path
        d="M6 4V3.2c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4"
        stroke="#3730a3"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <path d="M2 8.2h12" stroke="#3730a3" strokeWidth="1.2" />
      <rect x="7.1" y="7.5" width="1.8" height="1.5" rx="0.4" fill="#3730a3" />
    </svg>
  );
}

/**
 * Handles clear text icon.
 */
function ClearTextIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.2 3.2l9.6 9.6M12.8 3.2l-9.6 9.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

const CORNER_HANDLES: ResizeCorner[] = ["nw", "ne", "sw", "se"];

/**
 * Gets corner cursor.
 */
function getCornerCursor(corner: ResizeCorner): string {
  return corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
}

/**
 * Gets corner position style.
 */
function getCornerPositionStyle(corner: ResizeCorner): {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  transform: string;
} {
  if (corner === "nw") {
    return { left: 0, top: 0, transform: "translate(-50%, -50%)" };
  }

  if (corner === "ne") {
    return { right: 0, top: 0, transform: "translate(50%, -50%)" };
  }

  if (corner === "sw") {
    return { left: 0, bottom: 0, transform: "translate(-50%, 50%)" };
  }

  return { right: 0, bottom: 0, transform: "translate(50%, 50%)" };
}

/**
 * Gets connector anchor.
 */
function getConnectorAnchor(value: unknown): ConnectorAnchor | null {
  if (
    value === "top" ||
    value === "right" ||
    value === "bottom" ||
    value === "left"
  ) {
    return value;
  }

  return null;
}

/**
 * Handles to board object.
 */
function toBoardObject(
  rawId: string,
  rawData: Record<string, unknown>,
): BoardObject | null {
  const type = rawData.type;
  if (!isBoardObjectKind(type)) {
    return null;
  }

  const defaults = getDefaultObjectSize(type);
  const createdAtMs = getTimestampMillis(rawData.createdAt);

  return {
    id: rawId,
    type,
    zIndex: getNumber(rawData.zIndex, createdAtMs ?? 0),
    x: getNumber(rawData.x, 0),
    y: getNumber(rawData.y, 0),
    width: getNumber(rawData.width, defaults.width),
    height: getNumber(rawData.height, defaults.height),
    rotationDeg: getNumber(rawData.rotationDeg, 0),
    color: getString(rawData.color, getDefaultObjectColor(type)),
    text: getString(rawData.text, type === "sticky" ? "New sticky note" : ""),
    fromObjectId: getNullableString(rawData.fromObjectId),
    toObjectId: getNullableString(rawData.toObjectId),
    fromAnchor: getConnectorAnchor(rawData.fromAnchor),
    toAnchor: getConnectorAnchor(rawData.toAnchor),
    fromX: getFiniteNumber(rawData.fromX),
    fromY: getFiniteNumber(rawData.fromY),
    toX: getFiniteNumber(rawData.toX),
    toY: getFiniteNumber(rawData.toY),
    gridRows: getGridDimension(
      rawData.gridRows,
      type === "gridContainer" ? 2 : null,
    ),
    gridCols: getGridDimension(
      rawData.gridCols,
      type === "gridContainer" ? 2 : null,
    ),
    gridGap: getGridGap(
      rawData.gridGap,
      type === "gridContainer" ? GRID_CONTAINER_DEFAULT_GAP : null,
    ),
    gridCellColors: getGridCellColors(rawData.gridCellColors),
    containerTitle:
      type === "gridContainer"
        ? getString(rawData.containerTitle, "")
        : getNullableString(rawData.containerTitle),
    gridSectionTitles: getStringArray(rawData.gridSectionTitles),
    gridSectionNotes: getStringArray(rawData.gridSectionNotes),
    containerId: getNullableString(rawData.containerId),
    containerSectionIndex: getNonNegativeInteger(rawData.containerSectionIndex),
    containerRelX: getFiniteNumber(rawData.containerRelX),
    containerRelY: getFiniteNumber(rawData.containerRelY),
    updatedAt: getTimestampIso(rawData.updatedAt),
  };
}

/**
 * Handles to presence user.
 */
function toPresenceUser(
  rawId: string,
  rawData: Record<string, unknown>,
): PresenceUser {
  const lastSeenAtMs = getFiniteNumber(rawData.lastSeenAtMs);
  const lastSeenAt = lastSeenAtMs ?? getTimestampMillis(rawData.lastSeenAt);

  return {
    uid: rawId,
    displayName: getNullableString(rawData.displayName),
    email: getNullableString(rawData.email),
    color: getString(rawData.color, hashToColor(rawId)),
    cursorX: typeof rawData.cursorX === "number" ? rawData.cursorX : null,
    cursorY: typeof rawData.cursorY === "number" ? rawData.cursorY : null,
    active: Boolean(rawData.active),
    lastSeenAt,
  };
}

/**
 * Handles to board error message.
 */
function toBoardErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
    };

    const code = typeof candidate.code === "string" ? candidate.code : null;

    if (code === "permission-denied") {
      return "Your access to this board changed. Refresh or return to My Boards.";
    }

    if (code === "unauthenticated") {
      return "Your session expired. Please sign in again.";
    }

    if (code === "unavailable" || code === "deadline-exceeded") {
      return "Realtime sync is temporarily unavailable. Please try again.";
    }

    return fallback;
  }

  return fallback;
}

/**
 * Handles realtime board canvas.
 */
export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  const { resolvedTheme } = useTheme();
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const selectionHudRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cornerResizeStateRef = useRef<CornerResizeState | null>(null);
  const lineEndpointResizeStateRef = useRef<LineEndpointResizeState | null>(
    null,
  );
  const connectorEndpointDragStateRef =
    useRef<ConnectorEndpointDragState | null>(null);
  const rotateStateRef = useRef<RotateState | null>(null);
  const marqueeSelectionStateRef = useRef<MarqueeSelectionState | null>(null);
  const aiFooterResizeStateRef = useRef<AiFooterResizeState | null>(null);
  const stickyTextHoldDragRef = useRef<StickyTextHoldDragState | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());
  const objectSpawnSequenceRef = useRef(0);
  const selectedObjectIdsRef = useRef<Set<string>>(new Set());
  const draftGeometryByIdRef = useRef<Record<string, ObjectGeometry>>({});
  const draftConnectorByIdRef = useRef<Record<string, ConnectorDraft>>({});
  const gridContentDraftByIdRef = useRef<
    Record<string, GridContainerContentDraft>
  >({});
  const stickyTextSyncStateRef = useRef<Map<string, StickyTextSyncState>>(
    new Map(),
  );
  const gridContentSyncTimerByIdRef = useRef<Map<string, number>>(new Map());
  const sendCursorAtRef = useRef(0);
  const canEditRef = useRef(canEdit);
  const lastCursorWriteRef = useRef<BoardPoint | null>(null);
  const lastPositionWriteByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const lastGeometryWriteByIdRef = useRef<Map<string, ObjectGeometry>>(
    new Map(),
  );
  const lastStickyWriteByIdRef = useRef<Map<string, string>>(new Map());
  const writeMetricsRef = useRef(createRealtimeWriteMetrics());

  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [draftGeometryById, setDraftGeometryById] = useState<
    Record<string, ObjectGeometry>
  >({});
  const [draftConnectorById, setDraftConnectorById] = useState<
    Record<string, ConnectorDraft>
  >({});
  const [gridContentDraftById, setGridContentDraftById] = useState<
    Record<string, GridContainerContentDraft>
  >({});
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [marqueeSelectionState, setMarqueeSelectionState] =
    useState<MarqueeSelectionState | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const presenceClock = usePresenceClock(5_000);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isSnapToGridEnabled, setIsSnapToGridEnabled] = useState(true);
  const [isAiFooterCollapsed, setIsAiFooterCollapsed] = useState(true);
  const [hasAiDrawerBeenInteracted, setHasAiDrawerBeenInteracted] =
    useState(false);
  const [isAiDrawerNudgeActive, setIsAiDrawerNudgeActive] = useState(false);
  const [isAiFooterResizing, setIsAiFooterResizing] = useState(false);
  const [isObjectDragging, setIsObjectDragging] = useState(false);
  const [aiFooterHeight, setAiFooterHeight] = useState(
    AI_FOOTER_DEFAULT_HEIGHT,
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: createChatMessageId("a"),
      role: "assistant",
      text: AI_WELCOME_MESSAGE,
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [isSwotTemplateCreating, setIsSwotTemplateCreating] =
    useState(false);
  const [chatInputHistory, setChatInputHistory] = useState<string[]>([]);
  const [chatInputHistoryIndex, setChatInputHistoryIndex] = useState(-1);
  const [selectionLabelDraft, setSelectionLabelDraft] = useState("");
  const [cursorBoardPosition, setCursorBoardPosition] = useState<BoardPoint | null>(
    null,
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectionHudSize, setSelectionHudSize] = useState({
    width: 0,
    height: 0,
  });
  const chatInputHistoryDraftRef = useRef("");

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/objects`),
    [boardId, db],
  );
  const presenceCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/presence`),
    [boardId, db],
  );
  const selfPresenceRef = useMemo(
    () => doc(db, `boards/${boardId}/presence/${user.uid}`),
    [boardId, db, user.uid],
  );
  const snapToGridEnabledRef = useRef(isSnapToGridEnabled);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    snapToGridEnabledRef.current = isSnapToGridEnabled;
  }, [isSnapToGridEnabled]);

  const clearStickyTextHoldDrag = useCallback(() => {
    const holdState = stickyTextHoldDragRef.current;
    if (!holdState) {
      return;
    }

    if (holdState.timerId !== null) {
      window.clearTimeout(holdState.timerId);
    }

    stickyTextHoldDragRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      clearStickyTextHoldDrag();
    };
  }, [clearStickyTextHoldDrag]);

  useEffect(() => {
    objectsByIdRef.current = new Map(objects.map((item) => [item.id, item]));

    const objectIds = new Set(objects.map((item) => item.id));
    [
      lastPositionWriteByIdRef.current,
      lastGeometryWriteByIdRef.current,
      lastStickyWriteByIdRef.current,
    ].forEach((cache) => {
      Array.from(cache.keys()).forEach((objectId) => {
        if (!objectIds.has(objectId)) {
          cache.delete(objectId);
        }
      });
    });

    const removedGridDraftIds = Object.keys(
      gridContentDraftByIdRef.current,
    ).filter((objectId) => !objectIds.has(objectId));
    if (removedGridDraftIds.length > 0) {
      setGridContentDraftById((previous) => {
        const next = { ...previous };
        removedGridDraftIds.forEach((objectId) => {
          delete next[objectId];
        });
        return next;
      });
      removedGridDraftIds.forEach((objectId) => {
        const timerId = gridContentSyncTimerByIdRef.current.get(objectId);
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
          gridContentSyncTimerByIdRef.current.delete(objectId);
        }
      });
    }
  }, [objects]);

  useEffect(() => {
    draftGeometryByIdRef.current = draftGeometryById;
  }, [draftGeometryById]);

  useEffect(() => {
    draftConnectorByIdRef.current = draftConnectorById;
  }, [draftConnectorById]);

  useEffect(() => {
    gridContentDraftByIdRef.current = gridContentDraftById;
  }, [gridContentDraftById]);

  useEffect(() => {
    selectedObjectIdsRef.current = new Set(selectedObjectIds);
  }, [selectedObjectIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedHeight = window.localStorage.getItem(
      AI_FOOTER_HEIGHT_STORAGE_KEY,
    );
    if (!savedHeight) {
      return;
    }

    const parsedHeight = Number(savedHeight);
    if (!Number.isFinite(parsedHeight)) {
      return;
    }

    setAiFooterHeight(clampAiFooterHeight(parsedHeight));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedSnapToGrid = window.localStorage.getItem(
      SNAP_TO_GRID_STORAGE_KEY,
    );
    if (savedSnapToGrid === null) {
      return;
    }

    setIsSnapToGridEnabled(savedSnapToGrid !== "0");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      AI_FOOTER_HEIGHT_STORAGE_KEY,
      String(aiFooterHeight),
    );
  }, [aiFooterHeight]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SNAP_TO_GRID_STORAGE_KEY,
      isSnapToGridEnabled ? "1" : "0",
    );
  }, [isSnapToGridEnabled]);

  useEffect(() => {
    const element = chatMessagesRef.current;
    if (!element || isAiFooterCollapsed) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [chatMessages, isAiFooterCollapsed, isAiSubmitting]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !isAiFooterCollapsed ||
      hasAiDrawerBeenInteracted
    ) {
      setIsAiDrawerNudgeActive(false);
      return;
    }

    let nudgeCount = 0;
    let pulseTimeoutId: number | null = null;
    const triggerPulse = () => {
      setIsAiDrawerNudgeActive(true);
      pulseTimeoutId = window.setTimeout(() => {
        setIsAiDrawerNudgeActive(false);
      }, 380);
    };

    triggerPulse();
    const intervalId = window.setInterval(() => {
      nudgeCount += 1;
      if (nudgeCount >= 6) {
        window.clearInterval(intervalId);
        return;
      }
      triggerPulse();
    }, 2_800);

    return () => {
      window.clearInterval(intervalId);
      if (pulseTimeoutId !== null) {
        window.clearTimeout(pulseTimeoutId);
      }
      setIsAiDrawerNudgeActive(false);
    };
  }, [hasAiDrawerBeenInteracted, isAiFooterCollapsed]);

  useEffect(() => {
    if (
      process.env.NODE_ENV === "production" ||
      !isWriteMetricsDebugEnabled()
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const snapshot = writeMetricsRef.current.snapshot();
      console.info(`[realtime-write-metrics][board:${boardId}]`, snapshot);
    }, WRITE_METRICS_LOG_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [boardId]);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    /**
     * Handles sync stage size.
     */
    const syncStageSize = () => {
      setStageSize({
        width: stageElement.clientWidth,
        height: stageElement.clientHeight,
      });
    };

    syncStageSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncStageSize);
      return () => {
        window.removeEventListener("resize", syncStageSize);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      syncStageSize();
    });
    resizeObserver.observe(stageElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const syncStates = stickyTextSyncStateRef.current;
    const gridSyncTimers = gridContentSyncTimerByIdRef.current;

    return () => {
      syncStates.forEach((syncState) => {
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
        }
      });
      syncStates.clear();
      gridSyncTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      gridSyncTimers.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    /**
     * Handles refresh id token.
     */
    const refreshIdToken = async () => {
      try {
        const token = await user.getIdToken();
        if (!cancelled) {
          idTokenRef.current = token;
        }
      } catch {
        if (!cancelled) {
          idTokenRef.current = null;
        }
      }
    };

    void refreshIdToken();
    const refreshInterval = window.setInterval(() => {
      void refreshIdToken();
    }, 10 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [user]);

  const pushPresencePatchToApi = useCallback(
    (
      payload: {
        active: boolean;
        cursorX: number | null;
        cursorY: number | null;
      },
      keepalive: boolean,
    ) => {
      const idToken = idTokenRef.current;
      if (!idToken) {
        return;
      }

      void fetch(`/api/boards/${boardId}/presence`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        keepalive,
      }).catch(() => {
        // Best-effort fallback for tab close/navigation transitions.
      });
    },
    [boardId],
  );

  const markPresenceInactive = useCallback(
    (keepalive: boolean) => {
      lastCursorWriteRef.current = null;

      const payload = {
        active: false,
        cursorX: null,
        cursorY: null,
      };

      void setDoc(
        selfPresenceRef,
        {
          ...payload,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      ).catch(() => {
        // Ignore write failures during navigation/tab close.
      });

      pushPresencePatchToApi(payload, keepalive);
    },
    [pushPresencePatchToApi, selfPresenceRef],
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      objectsCollectionRef,
      (snapshot) => {
        const nextObjects: BoardObject[] = [];
        snapshot.docs.forEach((documentSnapshot) => {
          const parsed = toBoardObject(
            documentSnapshot.id,
            documentSnapshot.data() as Record<string, unknown>,
          );
          if (parsed) {
            nextObjects.push(parsed);
          }
        });

        nextObjects.sort((left, right) => {
          const leftRank = getRenderLayerRank(left.type);
          const rightRank = getRenderLayerRank(right.type);
          if (leftRank !== rightRank) {
            return leftRank - rightRank;
          }

          if (left.zIndex !== right.zIndex) {
            return left.zIndex - right.zIndex;
          }

          return left.id.localeCompare(right.id);
        });

        const nextObjectIds = new Set(
          nextObjects.map((objectItem) => objectItem.id),
        );
        setSelectedObjectIds((previous) =>
          previous.filter((objectId) => nextObjectIds.has(objectId)),
        );

        setObjects(nextObjects);
      },
      (error) => {
        console.error("Failed to sync board objects", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to sync board objects."),
        );
      },
    );

    return unsubscribe;
  }, [objectsCollectionRef]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      presenceCollectionRef,
      (snapshot) => {
        const users = snapshot.docs.map((documentSnapshot) =>
          toPresenceUser(
            documentSnapshot.id,
            documentSnapshot.data({
              serverTimestamps: "estimate",
            }) as Record<string, unknown>,
          ),
        );
        setPresenceUsers(users);
      },
      (error) => {
        console.error("Failed to sync presence", error);
      },
    );

    return unsubscribe;
  }, [presenceCollectionRef]);

  useEffect(() => {
    /**
     * Sets presence state.
     */
    const setPresenceState = async (
      cursor: BoardPoint | null,
      active: boolean,
    ) => {
      await setDoc(
        selfPresenceRef,
        {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null,
          color: boardColor,
          cursorX: cursor?.x ?? null,
          cursorY: cursor?.y ?? null,
          active,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp(),
        },
        { merge: true },
      );
    };

    void setPresenceState(null, true);

    const heartbeatInterval = window.setInterval(() => {
      void setPresenceState(null, true);
    }, PRESENCE_HEARTBEAT_MS);

    return () => {
      window.clearInterval(heartbeatInterval);
      markPresenceInactive(false);
    };
  }, [
    boardColor,
    markPresenceInactive,
    selfPresenceRef,
    user.displayName,
    user.email,
    user.uid,
  ]);

  useEffect(() => {
    /**
     * Handles handle page hide.
     */
    const handlePageHide = () => {
      markPresenceInactive(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [markPresenceInactive]);

  const getCurrentObjectGeometry = useCallback(
    (objectId: string): ObjectGeometry | null => {
      const draftGeometry = draftGeometryByIdRef.current[objectId];
      if (draftGeometry) {
        return draftGeometry;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem) {
        return null;
      }

      return {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
    },
    [],
  );

  const setDraftGeometry = useCallback(
    (objectId: string, geometry: ObjectGeometry) => {
      setDraftGeometryById((previous) => ({
        ...previous,
        [objectId]: geometry,
      }));
    },
    [],
  );

  const clearDraftGeometry = useCallback((objectId: string) => {
    setDraftGeometryById((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
  }, []);

  const setDraftConnector = useCallback(
    (objectId: string, draft: ConnectorDraft) => {
      setDraftConnectorById((previous) => ({
        ...previous,
        [objectId]: draft,
      }));
    },
    [],
  );

  const clearDraftConnector = useCallback((objectId: string) => {
    setDraftConnectorById((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
  }, []);

  const getConnectorDraftForObject = useCallback(
    (objectItem: BoardObject): ConnectorDraft | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const draft = draftConnectorByIdRef.current[objectItem.id];
      if (draft) {
        return draft;
      }

      const objectGeometry = getCurrentObjectGeometry(objectItem.id);
      const fallbackGeometry: ObjectGeometry = objectGeometry ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };

      const defaultFromX =
        objectItem.fromX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.1;
      const defaultFromY =
        objectItem.fromY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;
      const defaultToX =
        objectItem.toX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.9;
      const defaultToY =
        objectItem.toY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;

      return {
        fromObjectId: objectItem.fromObjectId ?? null,
        toObjectId: objectItem.toObjectId ?? null,
        fromAnchor: objectItem.fromAnchor ?? null,
        toAnchor: objectItem.toAnchor ?? null,
        fromX: defaultFromX,
        fromY: defaultFromY,
        toX: defaultToX,
        toY: defaultToY,
      };
    },
    [getCurrentObjectGeometry],
  );

  const resolveConnectorEndpoint = useCallback(
    (
      objectId: string | null,
      anchor: ConnectorAnchor | null,
      fallbackPoint: BoardPoint,
    ): ResolvedConnectorEndpoint => {
      if (!objectId || !anchor) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorObject = objectsByIdRef.current.get(objectId);
      if (!anchorObject || !isConnectableShapeKind(anchorObject.type)) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorPoint = getAnchorPointForGeometry(
        geometry,
        anchor,
        anchorObject.type,
      );
      return {
        x: anchorPoint.x,
        y: anchorPoint.y,
        objectId,
        anchor,
        direction: getAnchorDirectionForGeometry(anchor, geometry),
        connected: true,
      };
    },
    [getCurrentObjectGeometry],
  );

  const getResolvedConnectorEndpoints = useCallback(
    (
      objectItem: BoardObject,
    ): {
      from: ResolvedConnectorEndpoint;
      to: ResolvedConnectorEndpoint;
      draft: ConnectorDraft;
    } | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const connectorDraft = getConnectorDraftForObject(objectItem);
      if (!connectorDraft) {
        return null;
      }

      const from = resolveConnectorEndpoint(
        connectorDraft.fromObjectId,
        connectorDraft.fromAnchor,
        {
          x: connectorDraft.fromX,
          y: connectorDraft.fromY,
        },
      );
      const to = resolveConnectorEndpoint(
        connectorDraft.toObjectId,
        connectorDraft.toAnchor,
        {
          x: connectorDraft.toX,
          y: connectorDraft.toY,
        },
      );

      return {
        from,
        to,
        draft: connectorDraft,
      };
    },
    [getConnectorDraftForObject, resolveConnectorEndpoint],
  );

  const {
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
  } = useContainerMembership({
    objectsByIdRef,
    getCurrentObjectGeometry,
    maxRows: GRID_CONTAINER_MAX_ROWS,
    maxCols: GRID_CONTAINER_MAX_COLS,
    defaultGap: GRID_CONTAINER_DEFAULT_GAP,
    getDistance,
    roundToStep,
    isConnectorKind,
  });

  const updateObjectGeometry = useCallback(
    async (
      objectId: string,
      geometry: ObjectGeometry,
      options: ObjectWriteOptions = {},
    ) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("object-geometry");

      if (!canEditRef.current) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? true;
      const force = options.force ?? false;
      const objectItem = objectsByIdRef.current.get(objectId);
      const nextGeometry: ObjectGeometry = {
        x: roundToStep(geometry.x, POSITION_WRITE_STEP),
        y: roundToStep(geometry.y, POSITION_WRITE_STEP),
        width: roundToStep(geometry.width, POSITION_WRITE_STEP),
        height: roundToStep(geometry.height, POSITION_WRITE_STEP),
        rotationDeg:
          objectItem?.type === "gridContainer" ? 0 : geometry.rotationDeg,
      };
      const currentMembership = objectItem
        ? getMembershipPatchFromObject(objectItem)
        : {
            containerId: null,
            containerSectionIndex: null,
            containerRelX: null,
            containerRelY: null,
          };
      const membershipPatchFromOptions =
        options.containerMembershipById?.[objectId];
      const membershipPatch =
        membershipPatchFromOptions ??
        (objectItem &&
        objectItem.type !== "gridContainer" &&
        !isConnectorKind(objectItem.type)
          ? resolveContainerMembershipForGeometry(
              objectId,
              nextGeometry,
              getContainerSectionsInfoById({
                [objectId]: nextGeometry,
              }),
            )
          : null);
      const previousGeometry =
        lastGeometryWriteByIdRef.current.get(objectId) ??
        (objectItem
          ? {
              x: objectItem.x,
              y: objectItem.y,
              width: objectItem.width,
              height: objectItem.height,
              rotationDeg: objectItem.rotationDeg,
            }
          : null);
      const hasMembershipChange = membershipPatch
        ? !areContainerMembershipPatchesEqual(
            currentMembership,
            membershipPatch,
          )
        : false;

      if (
        !force &&
        previousGeometry &&
        areGeometriesClose(previousGeometry, nextGeometry) &&
        !hasMembershipChange
      ) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      try {
        const payload: Record<string, unknown> = {
          x: nextGeometry.x,
          y: nextGeometry.y,
          width: nextGeometry.width,
          height: nextGeometry.height,
          rotationDeg: nextGeometry.rotationDeg,
        };
        if (membershipPatch && (hasMembershipChange || force)) {
          payload.containerId = membershipPatch.containerId;
          payload.containerSectionIndex = membershipPatch.containerSectionIndex;
          payload.containerRelX = membershipPatch.containerRelX;
          payload.containerRelY = membershipPatch.containerRelY;
        }
        if (includeUpdatedAt) {
          payload.updatedAt = serverTimestamp();
        }

        await updateDoc(
          doc(db, `boards/${boardId}/objects/${objectId}`),
          payload,
        );
        lastGeometryWriteByIdRef.current.set(objectId, nextGeometry);
        lastPositionWriteByIdRef.current.set(objectId, {
          x: nextGeometry.x,
          y: nextGeometry.y,
        });
        writeMetrics.markCommitted("object-geometry");
      } catch (error) {
        console.error("Failed to update object transform", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update object transform."),
        );
      }
    },
    [
      boardId,
      db,
      getContainerSectionsInfoById,
      resolveContainerMembershipForGeometry,
    ],
  );

  const updateConnectorDraft = useCallback(
    async (
      objectId: string,
      draft: ConnectorDraft,
      options: ObjectWriteOptions = {},
    ) => {
      if (!canEditRef.current) {
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? true;

      const resolvedFrom = resolveConnectorEndpoint(
        draft.fromObjectId,
        draft.fromAnchor,
        { x: draft.fromX, y: draft.fromY },
      );
      const resolvedTo = resolveConnectorEndpoint(
        draft.toObjectId,
        draft.toAnchor,
        { x: draft.toX, y: draft.toY },
      );
      const geometry = toConnectorGeometryFromEndpoints(
        resolvedFrom,
        resolvedTo,
      );

      const payload: Record<string, unknown> = {
        x: geometry.x,
        y: geometry.y,
        width: geometry.width,
        height: geometry.height,
        rotationDeg: 0,
        fromObjectId: resolvedFrom.connected ? resolvedFrom.objectId : null,
        toObjectId: resolvedTo.connected ? resolvedTo.objectId : null,
        fromAnchor: resolvedFrom.connected ? resolvedFrom.anchor : null,
        toAnchor: resolvedTo.connected ? resolvedTo.anchor : null,
        fromX: resolvedFrom.x,
        fromY: resolvedFrom.y,
        toX: resolvedTo.x,
        toY: resolvedTo.y,
      };

      if (includeUpdatedAt) {
        payload.updatedAt = serverTimestamp();
      }

      try {
        await updateDoc(
          doc(db, `boards/${boardId}/objects/${objectId}`),
          payload,
        );
      } catch (error) {
        console.error("Failed to update connector", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update connector."),
        );
      }
    },
    [boardId, db, resolveConnectorEndpoint],
  );

  const updateObjectPositionsBatch = useCallback(
    async (
      nextPositionsById: Record<string, BoardPoint>,
      options: ObjectWriteOptions = {},
    ) => {
      const entries = Object.entries(nextPositionsById);
      if (entries.length === 0) {
        return;
      }

      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("object-position", entries.length);

      if (!canEditRef.current) {
        writeMetrics.markSkipped("object-position", entries.length);
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? false;
      const force = options.force ?? false;
      const membershipPatches = options.containerMembershipById ?? {};

      try {
        const batch = writeBatch(db);
        const writeEntries: Array<[string, BoardPoint]> = [];
        let skippedCount = 0;

        entries.forEach(([objectId, position]) => {
          const nextPosition = toWritePoint(position);
          const objectItem = objectsByIdRef.current.get(objectId);
          const previousPosition =
            lastPositionWriteByIdRef.current.get(objectId) ??
            (objectItem
              ? {
                  x: objectItem.x,
                  y: objectItem.y,
                }
              : null);
          const currentMembership = objectItem
            ? getMembershipPatchFromObject(objectItem)
            : {
                containerId: null,
                containerSectionIndex: null,
                containerRelX: null,
                containerRelY: null,
              };
          const nextMembershipPatch = membershipPatches[objectId];
          const hasMembershipChange = nextMembershipPatch
            ? !areContainerMembershipPatchesEqual(
                currentMembership,
                nextMembershipPatch,
              )
            : false;

          if (
            !force &&
            previousPosition &&
            arePointsClose(
              previousPosition,
              nextPosition,
              POSITION_WRITE_EPSILON,
            ) &&
            !hasMembershipChange
          ) {
            skippedCount += 1;
            return;
          }

          const updatePayload: Record<string, unknown> = {
            x: nextPosition.x,
            y: nextPosition.y,
          };
          if (nextMembershipPatch && (hasMembershipChange || force)) {
            updatePayload.containerId = nextMembershipPatch.containerId;
            updatePayload.containerSectionIndex =
              nextMembershipPatch.containerSectionIndex;
            updatePayload.containerRelX = nextMembershipPatch.containerRelX;
            updatePayload.containerRelY = nextMembershipPatch.containerRelY;
          }
          if (includeUpdatedAt) {
            updatePayload.updatedAt = serverTimestamp();
          }

          batch.update(
            doc(db, `boards/${boardId}/objects/${objectId}`),
            updatePayload,
          );
          writeEntries.push([objectId, nextPosition]);
        });

        if (skippedCount > 0) {
          writeMetrics.markSkipped("object-position", skippedCount);
        }

        if (writeEntries.length === 0) {
          return;
        }

        await batch.commit();
        writeMetrics.markCommitted("object-position", writeEntries.length);
        writeEntries.forEach(([objectId, position]) => {
          lastPositionWriteByIdRef.current.set(objectId, position);
          const previousGeometry =
            lastGeometryWriteByIdRef.current.get(objectId);
          if (previousGeometry) {
            lastGeometryWriteByIdRef.current.set(objectId, {
              ...previousGeometry,
              x: position.x,
              y: position.y,
            });
          }
        });
      } catch (error) {
        console.error("Failed to update object positions", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update object positions."),
        );
      }
    },
    [boardId, db],
  );

  const getObjectSelectionBounds = useCallback(
    (objectItem: BoardObject) => {
      if (isConnectorKind(objectItem.type)) {
        const resolved = getResolvedConnectorEndpoints(objectItem);
        if (resolved) {
          return getConnectorBoundsFromEndpoints(
            resolved.from,
            resolved.to,
            CONNECTOR_HIT_PADDING,
          );
        }
      }

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return {
          left: objectItem.x,
          right: objectItem.x + objectItem.width,
          top: objectItem.y,
          bottom: objectItem.y + objectItem.height,
        };
      }

      return getObjectVisualBounds(objectItem.type, geometry);
    },
    [getCurrentObjectGeometry, getResolvedConnectorEndpoints],
  );

  const getObjectsIntersectingRect = useCallback(
    (rect: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }): string[] => {
      const intersectingObjectIds: string[] = [];

      objectsByIdRef.current.forEach((objectItem) => {
        const bounds = getObjectSelectionBounds(objectItem);
        const intersects =
          bounds.right >= rect.left &&
          bounds.left <= rect.right &&
          bounds.bottom >= rect.top &&
          bounds.top <= rect.bottom;

        if (intersects) {
          intersectingObjectIds.push(objectItem.id);
        }
      });

      return intersectingObjectIds;
    },
    [getObjectSelectionBounds],
  );

  const getConnectableAnchorPoints = useCallback(() => {
    const anchors: Array<{
      objectId: string;
      anchor: ConnectorAnchor;
      x: number;
      y: number;
    }> = [];

    objectsByIdRef.current.forEach((objectItem) => {
      if (!isConnectableShapeKind(objectItem.type)) {
        return;
      }
      const connectableType = objectItem.type;

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return;
      }

      CONNECTOR_ANCHORS.forEach((anchor) => {
        const point = getAnchorPointForGeometry(
          geometry,
          anchor,
          connectableType,
        );
        anchors.push({
          objectId: objectItem.id,
          anchor,
          x: point.x,
          y: point.y,
        });
      });
    });

    return anchors;
  }, [getCurrentObjectGeometry]);

  const getResizedGeometry = useCallback(
    (
      state: CornerResizeState,
      clientX: number,
      clientY: number,
      scale: number,
    ): ObjectGeometry => {
      const deltaX = (clientX - state.startClientX) / scale;
      const deltaY = (clientY - state.startClientY) / scale;

      const minimumSize = getMinimumObjectSize(state.objectType);
      let nextX = state.initialGeometry.x;
      let nextY = state.initialGeometry.y;
      let nextWidth = state.initialGeometry.width;
      let nextHeight = state.initialGeometry.height;

      if (state.corner === "nw") {
        nextX = state.initialGeometry.x + deltaX;
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "ne") {
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "sw") {
        nextX = state.initialGeometry.x + deltaX;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      } else {
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      }

      if (nextWidth < minimumSize.width) {
        const deficit = minimumSize.width - nextWidth;
        nextWidth = minimumSize.width;
        if (state.corner === "nw" || state.corner === "sw") {
          nextX -= deficit;
        }
      }

      if (nextHeight < minimumSize.height) {
        const deficit = minimumSize.height - nextHeight;
        nextHeight = minimumSize.height;
        if (state.corner === "nw" || state.corner === "ne") {
          nextY -= deficit;
        }
      }

      if (state.objectType === "circle") {
        const size = Math.max(
          minimumSize.width,
          Math.max(nextWidth, nextHeight),
        );
        if (state.corner === "nw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "ne") {
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "sw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
        }

        nextWidth = size;
        nextHeight = size;
      }

      if (
        snapToGridEnabledRef.current &&
        isSnapEligibleObjectType(state.objectType)
      ) {
        const initialRight = state.initialGeometry.x + state.initialGeometry.width;
        const initialBottom =
          state.initialGeometry.y + state.initialGeometry.height;

        if (state.objectType === "circle") {
          const snappedSize = Math.max(minimumSize.width, snapToGrid(nextWidth));
          nextWidth = snappedSize;
          nextHeight = snappedSize;

          if (state.corner === "nw") {
            nextX = initialRight - snappedSize;
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "ne") {
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "sw") {
            nextX = initialRight - snappedSize;
          }
        } else {
          const snappedWidth = Math.max(minimumSize.width, snapToGrid(nextWidth));
          const snappedHeight = Math.max(
            minimumSize.height,
            snapToGrid(nextHeight),
          );

          if (state.corner === "nw" || state.corner === "sw") {
            nextX = initialRight - snappedWidth;
          }
          if (state.corner === "nw" || state.corner === "ne") {
            nextY = initialBottom - snappedHeight;
          }

          nextWidth = snappedWidth;
          nextHeight = snappedHeight;
        }
      }

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        rotationDeg: state.initialGeometry.rotationDeg,
      };
    },
    [],
  );

  const getLineGeometryFromEndpointDrag = useCallback(
    (
      state: LineEndpointResizeState,
      movingPoint: BoardPoint,
    ): ObjectGeometry => {
      const dx = movingPoint.x - state.fixedPoint.x;
      const dy = movingPoint.y - state.fixedPoint.y;
      const distance = Math.hypot(dx, dy);
      const length = Math.max(LINE_MIN_LENGTH, distance);
      const angle = distance < 0.001 ? 0 : toDegrees(Math.atan2(dy, dx));

      const normalizedX = distance < 0.001 ? 1 : dx / distance;
      const normalizedY = distance < 0.001 ? 0 : dy / distance;
      const adjustedMovingPoint = {
        x: state.fixedPoint.x + normalizedX * length,
        y: state.fixedPoint.y + normalizedY * length,
      };

      const startPoint =
        state.endpoint === "start" ? adjustedMovingPoint : state.fixedPoint;
      const endPoint =
        state.endpoint === "end" ? adjustedMovingPoint : state.fixedPoint;
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;

      return {
        x: centerX - length / 2,
        y: centerY - state.handleHeight / 2,
        width: length,
        height: state.handleHeight,
        rotationDeg: angle,
      };
    },
    [],
  );

  useEffect(() => {
    /**
     * Handles handle window pointer move.
     */
    const handleWindowPointerMove = (event: PointerEvent) => {
      const aiFooterResizeState = aiFooterResizeStateRef.current;
      if (aiFooterResizeState) {
        const deltaY = aiFooterResizeState.startClientY - event.clientY;
        const nextHeight = clampAiFooterHeight(
          aiFooterResizeState.initialHeight + deltaY,
        );
        setAiFooterHeight(nextHeight);
        return;
      }

      const scale = viewportRef.current.scale;
      const cornerResizeState = cornerResizeStateRef.current;
      if (cornerResizeState) {
        const nextGeometry = getResizedGeometry(
          cornerResizeState,
          event.clientX,
          event.clientY,
          scale,
        );

        setDraftGeometry(cornerResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - cornerResizeState.lastSentAt >= RESIZE_THROTTLE_MS
        ) {
          cornerResizeState.lastSentAt = now;
          void updateObjectGeometry(cornerResizeState.objectId, nextGeometry, {
            includeUpdatedAt: false,
          });
        }
        return;
      }

      const connectorEndpointDragState = connectorEndpointDragStateRef.current;
      if (connectorEndpointDragState) {
        const stageElement = stageRef.current;
        if (!stageElement) {
          return;
        }

        const rect = stageElement.getBoundingClientRect();
        const movingPoint = {
          x: (event.clientX - rect.left - viewportRef.current.x) / scale,
          y: (event.clientY - rect.top - viewportRef.current.y) / scale,
        };

        const connectorObject = objectsByIdRef.current.get(
          connectorEndpointDragState.objectId,
        );
        if (!connectorObject || !isConnectorKind(connectorObject.type)) {
          return;
        }

        const currentDraft =
          draftConnectorByIdRef.current[connectorObject.id] ??
          getConnectorDraftForObject(connectorObject);
        if (!currentDraft) {
          return;
        }

        const snapThreshold =
          CONNECTOR_SNAP_DISTANCE_PX / Math.max(viewportRef.current.scale, 0.1);
        const anchorCandidates = getConnectableAnchorPoints();
        const nearestAnchor = anchorCandidates.reduce<{
          objectId: string;
          anchor: ConnectorAnchor;
          x: number;
          y: number;
          distance: number;
        } | null>((closest, candidate) => {
          const distance = Math.hypot(
            candidate.x - movingPoint.x,
            candidate.y - movingPoint.y,
          );
          if (distance > snapThreshold) {
            return closest;
          }

          if (!closest || distance < closest.distance) {
            return {
              ...candidate,
              distance,
            };
          }

          return closest;
        }, null);

        const endpointPatch = nearestAnchor
          ? {
              objectId: nearestAnchor.objectId,
              anchor: nearestAnchor.anchor,
              x: nearestAnchor.x,
              y: nearestAnchor.y,
            }
          : {
              objectId: null,
              anchor: null,
              x: movingPoint.x,
              y: movingPoint.y,
            };

        const nextDraft: ConnectorDraft =
          connectorEndpointDragState.endpoint === "from"
            ? {
                ...currentDraft,
                fromObjectId: endpointPatch.objectId,
                fromAnchor: endpointPatch.anchor,
                fromX: endpointPatch.x,
                fromY: endpointPatch.y,
              }
            : {
                ...currentDraft,
                toObjectId: endpointPatch.objectId,
                toAnchor: endpointPatch.anchor,
                toX: endpointPatch.x,
                toY: endpointPatch.y,
              };

        setDraftConnector(connectorObject.id, nextDraft);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - connectorEndpointDragState.lastSentAt >= RESIZE_THROTTLE_MS
        ) {
          connectorEndpointDragState.lastSentAt = now;
          void updateConnectorDraft(connectorObject.id, nextDraft, {
            includeUpdatedAt: false,
          });
        }
        return;
      }

      const lineEndpointResizeState = lineEndpointResizeStateRef.current;
      if (lineEndpointResizeState) {
        const stageElement = stageRef.current;
        if (!stageElement) {
          return;
        }

        const rect = stageElement.getBoundingClientRect();
        const movingPoint = {
          x: (event.clientX - rect.left - viewportRef.current.x) / scale,
          y: (event.clientY - rect.top - viewportRef.current.y) / scale,
        };
        const nextMovingPoint =
          snapToGridEnabledRef.current && isSnapEligibleObjectType("line")
            ? {
                x: snapToGrid(movingPoint.x),
                y: snapToGrid(movingPoint.y),
              }
            : movingPoint;

        const nextGeometry = getLineGeometryFromEndpointDrag(
          lineEndpointResizeState,
          nextMovingPoint,
        );

        setDraftGeometry(lineEndpointResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - lineEndpointResizeState.lastSentAt >= RESIZE_THROTTLE_MS
        ) {
          lineEndpointResizeState.lastSentAt = now;
          void updateObjectGeometry(
            lineEndpointResizeState.objectId,
            nextGeometry,
            {
              includeUpdatedAt: false,
            },
          );
        }
        return;
      }

      const rotateState = rotateStateRef.current;
      if (rotateState) {
        const stageElement = stageRef.current;
        if (!stageElement) {
          return;
        }

        const rect = stageElement.getBoundingClientRect();
        const pointer = {
          x: (event.clientX - rect.left - viewportRef.current.x) / scale,
          y: (event.clientY - rect.top - viewportRef.current.y) / scale,
        };

        const pointerAngleDeg = toDegrees(
          Math.atan2(
            pointer.y - rotateState.centerPoint.y,
            pointer.x - rotateState.centerPoint.x,
          ),
        );
        const deltaAngle = pointerAngleDeg - rotateState.initialPointerAngleDeg;
        let nextRotationDeg = rotateState.initialRotationDeg + deltaAngle;

        if (event.shiftKey) {
          nextRotationDeg = Math.round(nextRotationDeg / 15) * 15;
        }

        const normalizedRotationDeg = ((nextRotationDeg % 360) + 360) % 360;

        const geometry = getCurrentObjectGeometry(rotateState.objectId);
        if (!geometry) {
          return;
        }

        const nextGeometry: ObjectGeometry = {
          ...geometry,
          rotationDeg: normalizedRotationDeg,
        };
        setDraftGeometry(rotateState.objectId, nextGeometry);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - rotateState.lastSentAt >= ROTATE_THROTTLE_MS
        ) {
          rotateState.lastSentAt = now;
          void updateObjectGeometry(rotateState.objectId, nextGeometry, {
            includeUpdatedAt: false,
          });
        }
        return;
      }

      const marqueeSelectionState = marqueeSelectionStateRef.current;
      if (marqueeSelectionState) {
        const stageElement = stageRef.current;
        if (!stageElement) {
          return;
        }

        const rect = stageElement.getBoundingClientRect();
        const nextPoint = {
          x: (event.clientX - rect.left - viewportRef.current.x) / scale,
          y: (event.clientY - rect.top - viewportRef.current.y) / scale,
        };

        const nextMarqueeState: MarqueeSelectionState = {
          ...marqueeSelectionState,
          currentPoint: nextPoint,
        };

        marqueeSelectionStateRef.current = nextMarqueeState;
        setMarqueeSelectionState(nextMarqueeState);
        return;
      }

      const panState = panStateRef.current;
      if (panState) {
        const nextX =
          panState.initialX + (event.clientX - panState.startClientX);
        const nextY =
          panState.initialY + (event.clientY - panState.startClientY);
        setViewport((previous) => ({
          x: nextX,
          y: nextY,
          scale: previous.scale,
        }));
      }

      const dragState = dragStateRef.current;
      if (dragState) {
        const pointerDeltaX = event.clientX - dragState.startClientX;
        const pointerDeltaY = event.clientY - dragState.startClientY;
        if (!dragState.hasMoved) {
          dragState.hasMoved =
            Math.hypot(pointerDeltaX, pointerDeltaY) >= DRAG_CLICK_SLOP_PX;
        }

        if (!dragState.hasMoved) {
          return;
        }

        const deltaX = (event.clientX - dragState.startClientX) / scale;
        const deltaY = (event.clientY - dragState.startClientY) / scale;

        const nextPositionsById: Record<string, BoardPoint> = {};
        const draggedContainerIds: string[] = [];

        dragState.objectIds.forEach((objectId) => {
          const initialGeometry = dragState.initialGeometries[objectId];
          const currentGeometry = getCurrentObjectGeometry(objectId);
          const objectItem = objectsByIdRef.current.get(objectId);
          if (!initialGeometry || !currentGeometry) {
            return;
          }

          let nextX = initialGeometry.x + deltaX;
          let nextY = initialGeometry.y + deltaY;

          if (
            snapToGridEnabledRef.current &&
            objectItem &&
            isSnapEligibleObjectType(objectItem.type)
          ) {
            nextX = snapToGrid(nextX);
            nextY = snapToGrid(nextY);
          }

          nextPositionsById[objectId] = {
            x: nextX,
            y: nextY,
          };

          setDraftGeometry(objectId, {
            ...currentGeometry,
            x: nextX,
            y: nextY,
          });

          if (objectItem?.type === "gridContainer") {
            draggedContainerIds.push(objectId);
          }
        });

        draggedContainerIds.forEach((containerId) => {
          const containerItem = objectsByIdRef.current.get(containerId);
          const nextPosition = nextPositionsById[containerId];
          if (
            !containerItem ||
            containerItem.type !== "gridContainer" ||
            !nextPosition
          ) {
            return;
          }

          const nextContainerGeometry: ObjectGeometry = {
            x: nextPosition.x,
            y: nextPosition.y,
            width: containerItem.width,
            height: containerItem.height,
            rotationDeg: containerItem.rotationDeg,
          };
          const rows = Math.max(1, containerItem.gridRows ?? 2);
          const cols = Math.max(1, containerItem.gridCols ?? 2);
          const gap = Math.max(
            0,
            containerItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
          );
          const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
            containerId,
            nextContainerGeometry,
            rows,
            cols,
            gap,
            {
              clampToSectionBounds: false,
              includeObjectsInNextBounds: false,
            },
          );
          Object.entries(childUpdates.positionByObjectId).forEach(
            ([childId, childPosition]) => {
              if (childId in nextPositionsById) {
                return;
              }

              nextPositionsById[childId] = childPosition;
              const currentChildGeometry = getCurrentObjectGeometry(childId);
              if (!currentChildGeometry) {
                return;
              }
              setDraftGeometry(childId, {
                ...currentChildGeometry,
                x: childPosition.x,
                y: childPosition.y,
              });
            },
          );
        });

        const now = Date.now();
        if (
          canEditRef.current &&
          draggedContainerIds.length === 0 &&
          now - dragState.lastSentAt >= DRAG_THROTTLE_MS
        ) {
          dragState.lastSentAt = now;
          void updateObjectPositionsBatch(nextPositionsById, {
            includeUpdatedAt: false,
          });
        }
      }
    };

    /**
     * Handles handle window pointer up.
     */
    const handleWindowPointerUp = (event: PointerEvent) => {
      clearStickyTextHoldDrag();

      if (aiFooterResizeStateRef.current) {
        aiFooterResizeStateRef.current = null;
        setIsAiFooterResizing(false);
        return;
      }

      const cornerResizeState = cornerResizeStateRef.current;
      if (cornerResizeState) {
        cornerResizeStateRef.current = null;
        const finalGeometry =
          draftGeometryByIdRef.current[cornerResizeState.objectId];
        const resizedObject = objectsByIdRef.current.get(
          cornerResizeState.objectId,
        );
        clearDraftGeometry(cornerResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void (async () => {
            await updateObjectGeometry(
              cornerResizeState.objectId,
              finalGeometry,
              {
                includeUpdatedAt: true,
                force: true,
              },
            );

            if (resizedObject?.type === "gridContainer") {
              const rows = Math.max(1, resizedObject.gridRows ?? 2);
              const cols = Math.max(1, resizedObject.gridCols ?? 2);
              const gap = Math.max(
                0,
                resizedObject.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
              );
              const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
                resizedObject.id,
                finalGeometry,
                rows,
                cols,
                gap,
              );
              const childIds = Object.keys(childUpdates.positionByObjectId);
              if (childIds.length > 0) {
                const membershipByObjectId =
                  buildContainerMembershipPatchesForPositions(
                    childUpdates.positionByObjectId,
                    childUpdates.membershipByObjectId,
                  );
                await updateObjectPositionsBatch(
                  childUpdates.positionByObjectId,
                  {
                    includeUpdatedAt: true,
                    force: true,
                    containerMembershipById: membershipByObjectId,
                  },
                );
              }
            }
          })();
        }
        return;
      }

      const lineEndpointResizeState = lineEndpointResizeStateRef.current;
      if (lineEndpointResizeState) {
        lineEndpointResizeStateRef.current = null;
        const finalGeometry =
          draftGeometryByIdRef.current[lineEndpointResizeState.objectId];
        clearDraftGeometry(lineEndpointResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(
            lineEndpointResizeState.objectId,
            finalGeometry,
            {
              includeUpdatedAt: true,
              force: true,
            },
          );
        }
        return;
      }

      const connectorEndpointDragState = connectorEndpointDragStateRef.current;
      if (connectorEndpointDragState) {
        connectorEndpointDragStateRef.current = null;
        const finalDraft =
          draftConnectorByIdRef.current[connectorEndpointDragState.objectId];
        clearDraftConnector(connectorEndpointDragState.objectId);

        if (finalDraft && canEditRef.current) {
          void updateConnectorDraft(
            connectorEndpointDragState.objectId,
            finalDraft,
            {
              includeUpdatedAt: true,
            },
          );
        }
        return;
      }

      const rotateState = rotateStateRef.current;
      if (rotateState) {
        rotateStateRef.current = null;
        const finalGeometry =
          draftGeometryByIdRef.current[rotateState.objectId];
        clearDraftGeometry(rotateState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(rotateState.objectId, finalGeometry, {
            includeUpdatedAt: true,
            force: true,
          });
        }
        return;
      }

      const marqueeSelectionState = marqueeSelectionStateRef.current;
      if (marqueeSelectionState) {
        marqueeSelectionStateRef.current = null;
        setMarqueeSelectionState(null);

        const rect = toNormalizedRect(
          marqueeSelectionState.startPoint,
          marqueeSelectionState.currentPoint,
        );
        const intersectingObjectIds = getObjectsIntersectingRect(rect);

        if (marqueeSelectionState.mode === "add") {
          setSelectedObjectIds((previous) => {
            const next = new Set(previous);
            intersectingObjectIds.forEach((objectId) => next.add(objectId));
            return Array.from(next);
          });
        } else {
          const removeSet = new Set(intersectingObjectIds);
          setSelectedObjectIds((previous) =>
            previous.filter((objectId) => !removeSet.has(objectId)),
          );
        }
        return;
      }

      if (panStateRef.current) {
        panStateRef.current = null;
      }

      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const scale = viewportRef.current.scale;
      const deltaX = (event.clientX - dragState.startClientX) / scale;
      const deltaY = (event.clientY - dragState.startClientY) / scale;

      dragStateRef.current = null;
      setIsObjectDragging(false);

      if (!dragState.hasMoved) {
        dragState.objectIds.forEach((objectId) => {
          clearDraftGeometry(objectId);
        });

        if (dragState.collapseToObjectIdOnClick) {
          setSelectedObjectIds([dragState.collapseToObjectIdOnClick]);
        }
        return;
      }

      if (canEditRef.current) {
        const nextPositionsById: Record<string, BoardPoint> = {};
        const seedMembershipByObjectId: Record<
          string,
          ContainerMembershipPatch
        > = {};
        dragState.objectIds.forEach((objectId) => {
          const initialGeometry = dragState.initialGeometries[objectId];
          const objectItem = objectsByIdRef.current.get(objectId);
          if (!initialGeometry) {
            return;
          }

          clearDraftGeometry(objectId);
          let nextX = initialGeometry.x + deltaX;
          let nextY = initialGeometry.y + deltaY;
          if (
            snapToGridEnabledRef.current &&
            objectItem &&
            isSnapEligibleObjectType(objectItem.type)
          ) {
            nextX = snapToGrid(nextX);
            nextY = snapToGrid(nextY);
          }
          nextPositionsById[objectId] = {
            x: nextX,
            y: nextY,
          };
        });

        dragState.objectIds.forEach((objectId) => {
          const objectItem = objectsByIdRef.current.get(objectId);
          if (!objectItem || objectItem.type !== "gridContainer") {
            return;
          }

          const nextPosition = nextPositionsById[objectId];
          if (!nextPosition) {
            return;
          }

          const nextContainerGeometry: ObjectGeometry = {
            x: nextPosition.x,
            y: nextPosition.y,
            width: objectItem.width,
            height: objectItem.height,
            rotationDeg: objectItem.rotationDeg,
          };
          const rows = Math.max(1, objectItem.gridRows ?? 2);
          const cols = Math.max(1, objectItem.gridCols ?? 2);
          const gap = Math.max(
            0,
            objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
          );
          const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
            objectId,
            nextContainerGeometry,
            rows,
            cols,
            gap,
            {
              // Keep existing child placement stable during container drags.
              clampToSectionBounds: false,
              // Do not pull in unrelated objects just because the container moved over them.
              includeObjectsInNextBounds: false,
            },
          );

          Object.entries(childUpdates.positionByObjectId).forEach(
            ([childId, childPosition]) => {
              if (!(childId in nextPositionsById)) {
                nextPositionsById[childId] = childPosition;
              }
            },
          );
          Object.entries(childUpdates.membershipByObjectId).forEach(
            ([childId, patch]) => {
              if (!(childId in seedMembershipByObjectId)) {
                seedMembershipByObjectId[childId] = patch;
              }
            },
          );
        });

        const membershipByObjectId =
          buildContainerMembershipPatchesForPositions(
            nextPositionsById,
            seedMembershipByObjectId,
          );

        Object.keys(nextPositionsById).forEach((objectId) => {
          clearDraftGeometry(objectId);
        });

        void updateObjectPositionsBatch(nextPositionsById, {
          includeUpdatedAt: true,
          force: true,
          containerMembershipById: membershipByObjectId,
        });
      } else {
        dragState.objectIds.forEach((objectId) => {
          clearDraftGeometry(objectId);
        });
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [
    clearStickyTextHoldDrag,
    clearDraftConnector,
    clearDraftGeometry,
    getConnectableAnchorPoints,
    getConnectorDraftForObject,
    getObjectsIntersectingRect,
    getCurrentObjectGeometry,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    setDraftConnector,
    setDraftGeometry,
    buildContainerMembershipPatchesForPositions,
    getSectionAnchoredObjectUpdatesForContainer,
    updateConnectorDraft,
    updateObjectGeometry,
    updateObjectPositionsBatch,
  ]);

  const toBoardCoordinates = useCallback(
    (clientX: number, clientY: number): BoardPoint | null => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return null;
      }

      const rect = stageElement.getBoundingClientRect();
      const x =
        (clientX - rect.left - viewportRef.current.x) /
        viewportRef.current.scale;
      const y =
        (clientY - rect.top - viewportRef.current.y) /
        viewportRef.current.scale;

      return { x, y };
    },
    [],
  );

  const updateCursor = useCallback(
    async (cursor: BoardPoint | null, options: { force?: boolean } = {}) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("cursor");

      const force = options.force ?? false;
      const nextCursor = cursor ? toWritePoint(cursor) : null;
      const previousCursor = lastCursorWriteRef.current;

      if (!force) {
        if (nextCursor === null && previousCursor === null) {
          writeMetrics.markSkipped("cursor");
          return;
        }

        if (
          nextCursor !== null &&
          previousCursor !== null &&
          getDistance(nextCursor, previousCursor) < CURSOR_MIN_MOVE_DISTANCE
        ) {
          writeMetrics.markSkipped("cursor");
          return;
        }
      }

      try {
        await setDoc(
          selfPresenceRef,
          {
            cursorX: nextCursor?.x ?? null,
            cursorY: nextCursor?.y ?? null,
            active: true,
            lastSeenAtMs: Date.now(),
            lastSeenAt: serverTimestamp(),
          },
          { merge: true },
        );
        lastCursorWriteRef.current = nextCursor;
        writeMetrics.markCommitted("cursor");
      } catch {
        // Ignore cursor write failures to avoid interrupting interactions.
      }
    },
    [selfPresenceRef],
  );

  const createObject = useCallback(
    async (kind: BoardObjectKind) => {
      if (!canEdit) {
        return;
      }

      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      const centerX =
        (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
      const centerY =
        (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
      const defaultSize = getDefaultObjectSize(kind);
      let width = defaultSize.width;
      let height = defaultSize.height;
      if (kind === "gridContainer") {
        const viewableWidth = rect.width / viewportRef.current.scale;
        const viewableHeight = rect.height / viewportRef.current.scale;
        const minimumSize = getMinimumObjectSize(kind);
        width = Math.max(minimumSize.width, Math.round(viewableWidth * 0.9));
        height = Math.max(minimumSize.height, Math.round(viewableHeight * 0.9));
      }
      const spawnIndex =
        objectsByIdRef.current.size + objectSpawnSequenceRef.current;
      objectSpawnSequenceRef.current += 1;
      const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
      const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
        0,
      );
      const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
        0,
      );
      const nextZIndex = isBackgroundContainerType(kind)
        ? lowestZIndex - 1
        : highestZIndex + 1;
      const startXRaw = centerX - width / 2 + spawnOffset.x;
      const startYRaw = centerY - height / 2 + spawnOffset.y;
      const startX =
        snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
          ? snapToGrid(startXRaw)
          : startXRaw;
      const startY =
        snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
          ? snapToGrid(startYRaw)
          : startYRaw;
      const isConnector = isConnectorKind(kind);

      try {
        const connectorFrom = isConnector
          ? {
              x: startX,
              y: startY + height / 2,
            }
          : null;
        const connectorTo = isConnector
          ? {
              x: startX + width,
              y: startY + height / 2,
            }
          : null;
        const connectorGeometry =
          connectorFrom && connectorTo
            ? toConnectorGeometryFromEndpoints(connectorFrom, connectorTo)
            : null;

        const payload: Record<string, unknown> = {
          type: kind,
          zIndex: nextZIndex,
          x: connectorGeometry ? connectorGeometry.x : startX,
          y: connectorGeometry ? connectorGeometry.y : startY,
          width: connectorGeometry ? connectorGeometry.width : width,
          height: connectorGeometry ? connectorGeometry.height : height,
          rotationDeg: 0,
          color: getDefaultObjectColor(kind),
          text: kind === "sticky" ? "New sticky note" : "",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (kind === "gridContainer") {
          const defaultSectionTitles = getDefaultSectionTitles(1, 1);
          payload.gridRows = 1;
          payload.gridCols = 1;
          payload.gridGap = GRID_CONTAINER_DEFAULT_GAP;
          payload.gridCellColors = ["transparent"];
          payload.containerTitle = "";
          payload.gridSectionTitles = defaultSectionTitles;
          payload.gridSectionNotes = Array.from(
            { length: defaultSectionTitles.length },
            () => "",
          );
        }

        if (connectorFrom && connectorTo) {
          payload.fromObjectId = null;
          payload.toObjectId = null;
          payload.fromAnchor = null;
          payload.toAnchor = null;
          payload.fromX = connectorFrom.x;
          payload.fromY = connectorFrom.y;
          payload.toX = connectorTo.x;
          payload.toY = connectorTo.y;
        }

        await addDoc(objectsCollectionRef, payload);
      } catch (error) {
        console.error("Failed to create object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to create object."));
      }
    },
    [canEdit, objectsCollectionRef, user.uid],
  );

  const createSwotTemplate = useCallback(async () => {
    if (!canEdit) {
      return null;
    }

    const stageElement = stageRef.current;
    if (!stageElement) {
      return null;
    }

    const rect = stageElement.getBoundingClientRect();
    const centerX =
      (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
    const centerY =
      (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
    const viewableWidth = rect.width / viewportRef.current.scale;
    const viewableHeight = rect.height / viewportRef.current.scale;
    const defaultSize = getDefaultObjectSize("gridContainer");
    const minimumSize = getMinimumObjectSize("gridContainer");
    const width = Math.max(
      minimumSize.width,
      Math.min(
        2_400,
        Math.max(defaultSize.width, Math.round(viewableWidth * 0.9)),
      ),
    );
    const height = Math.max(
      minimumSize.height,
      Math.min(
        1_600,
        Math.max(defaultSize.height, Math.round(viewableHeight * 0.9)),
      ),
    );
    const spawnIndex =
      objectsByIdRef.current.size + objectSpawnSequenceRef.current;
    objectSpawnSequenceRef.current += 1;
    const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
    const startXRaw = centerX - width / 2 + spawnOffset.x;
    const startYRaw = centerY - height / 2 + spawnOffset.y;
    const startX =
      snapToGridEnabledRef.current && isSnapEligibleObjectType("gridContainer")
        ? snapToGrid(startXRaw)
        : startXRaw;
    const startY =
      snapToGridEnabledRef.current && isSnapEligibleObjectType("gridContainer")
        ? snapToGrid(startYRaw)
        : startYRaw;
    const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
      (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
      0,
    );
    const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
      (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
      0,
    );
    const nextZIndex = isBackgroundContainerType("gridContainer")
      ? lowestZIndex - 1
      : highestZIndex + 1;

    try {
      const docRef = await addDoc(objectsCollectionRef, {
        type: "gridContainer",
        zIndex: nextZIndex,
        x: startX,
        y: startY,
        width,
        height,
        rotationDeg: 0,
        color: getDefaultObjectColor("gridContainer"),
        text: "",
        gridRows: 2,
        gridCols: 2,
        gridGap: 2,
        gridCellColors: [...SWOT_SECTION_COLORS],
        containerTitle: SWOT_TEMPLATE_TITLE,
        gridSectionTitles: [...DEFAULT_SWOT_SECTION_TITLES],
        gridSectionNotes: ["", "", "", ""],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to create SWOT template", error);
      setBoardError(toBoardErrorMessage(error, "Failed to create SWOT template."));
      return null;
    }
  }, [canEdit, objectsCollectionRef, user.uid]);

  const deleteObject = useCallback(
    async (objectId: string) => {
      if (!canEdit) {
        return;
      }

      try {
        await deleteDoc(doc(db, `boards/${boardId}/objects/${objectId}`));
        const syncState = stickyTextSyncStateRef.current.get(objectId);
        if (syncState && syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
        }
        stickyTextSyncStateRef.current.delete(objectId);
        lastStickyWriteByIdRef.current.delete(objectId);
        lastPositionWriteByIdRef.current.delete(objectId);
        lastGeometryWriteByIdRef.current.delete(objectId);
        const gridTimerId = gridContentSyncTimerByIdRef.current.get(objectId);
        if (gridTimerId !== undefined) {
          window.clearTimeout(gridTimerId);
          gridContentSyncTimerByIdRef.current.delete(objectId);
        }
        setGridContentDraftById((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
        setTextDrafts((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
        setSelectedObjectIds((previous) =>
          previous.filter((id) => id !== objectId),
        );
        clearDraftConnector(objectId);
      } catch (error) {
        console.error("Failed to delete object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to delete object."));
      }
    },
    [boardId, canEdit, clearDraftConnector, db],
  );

  const saveStickyText = useCallback(
    async (objectId: string, nextText: string) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("sticky-text");

      if (!canEditRef.current) {
        writeMetrics.markSkipped("sticky-text");
        return;
      }

      try {
        const normalizedText = nextText.slice(0, 1_000);
        const lastWrittenText = lastStickyWriteByIdRef.current.get(objectId);
        if (lastWrittenText === normalizedText) {
          writeMetrics.markSkipped("sticky-text");
          return;
        }

        const objectItem = objectsByIdRef.current.get(objectId);
        if (objectItem && objectItem.text === normalizedText) {
          lastStickyWriteByIdRef.current.set(objectId, normalizedText);
          writeMetrics.markSkipped("sticky-text");
          return;
        }

        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: normalizedText,
          updatedAt: serverTimestamp(),
        });
        lastStickyWriteByIdRef.current.set(objectId, normalizedText);
        const syncState = stickyTextSyncStateRef.current.get(objectId);
        if (syncState) {
          syncState.lastSentText = normalizedText;
        }
        writeMetrics.markCommitted("sticky-text");
      } catch (error) {
        console.error("Failed to update sticky text", error);
        setBoardError(
          toBoardErrorMessage(error, "Failed to update sticky text."),
        );
      }
    },
    [boardId, db],
  );

  const flushStickyTextSync = useCallback(
    (objectId: string) => {
      const syncState = stickyTextSyncStateRef.current.get(objectId);
      if (!syncState) {
        return;
      }

      if (syncState.timerId !== null) {
        window.clearTimeout(syncState.timerId);
        syncState.timerId = null;
      }

      const pendingText = syncState.pendingText;
      if (pendingText === null) {
        return;
      }

      syncState.pendingText = null;
      syncState.lastSentAt = Date.now();
      void saveStickyText(objectId, pendingText);
    },
    [saveStickyText],
  );

  const queueStickyTextSync = useCallback(
    (objectId: string, nextText: string) => {
      if (!canEditRef.current) {
        return;
      }

      const normalizedText = nextText.slice(0, 1_000);
      const syncStates = stickyTextSyncStateRef.current;
      let syncState = syncStates.get(objectId);

      if (!syncState) {
        const objectItem = objectsByIdRef.current.get(objectId);
        syncState = {
          pendingText: null,
          lastSentAt: 0,
          lastSentText:
            lastStickyWriteByIdRef.current.get(objectId) ??
            objectItem?.text ??
            null,
          timerId: null,
        };
        syncStates.set(objectId, syncState);
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      const lastSavedText =
        syncState.lastSentText ??
        lastStickyWriteByIdRef.current.get(objectId) ??
        null;
      if (
        normalizedText === lastSavedText ||
        (objectItem && objectItem.text === normalizedText)
      ) {
        syncState.pendingText = null;
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
          syncState.timerId = null;
        }
        return;
      }

      syncState.pendingText = normalizedText;

      const now = Date.now();
      const elapsed = now - syncState.lastSentAt;

      if (elapsed >= STICKY_TEXT_SYNC_THROTTLE_MS) {
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
          syncState.timerId = null;
        }

        syncState.lastSentAt = now;
        const pendingText = syncState.pendingText;
        syncState.pendingText = null;

        if (pendingText !== null) {
          void saveStickyText(objectId, pendingText);
        }
        return;
      }

      const delay = STICKY_TEXT_SYNC_THROTTLE_MS - elapsed;
      if (syncState.timerId !== null) {
        window.clearTimeout(syncState.timerId);
      }

      syncState.timerId = window.setTimeout(() => {
        const latestSyncState = stickyTextSyncStateRef.current.get(objectId);
        if (!latestSyncState) {
          return;
        }

        latestSyncState.timerId = null;
        const pendingText = latestSyncState.pendingText;
        if (pendingText === null) {
          return;
        }

        latestSyncState.pendingText = null;
        latestSyncState.lastSentAt = Date.now();
        void saveStickyText(objectId, pendingText);
      }, delay);
    },
    [saveStickyText],
  );

  const buildGridDraft = useCallback(
    (objectItem: BoardObject): GridContainerContentDraft => {
      const rows = Math.max(1, objectItem.gridRows ?? 2);
      const cols = Math.max(1, objectItem.gridCols ?? 2);
      const sectionCount = rows * cols;
      const defaultSectionTitles = getDefaultSectionTitles(rows, cols);
      return {
        containerTitle: (objectItem.containerTitle ?? "").slice(0, 120),
        sectionTitles: normalizeSectionValues(
          objectItem.gridSectionTitles,
          sectionCount,
          (index) => defaultSectionTitles[index] ?? `Section ${index + 1}`,
          80,
        ),
        sectionNotes: normalizeSectionValues(
          objectItem.gridSectionNotes,
          sectionCount,
          () => "",
          600,
        ),
      };
    },
    [],
  );

  const getGridDraftForObject = useCallback(
    (objectItem: BoardObject): GridContainerContentDraft => {
      const existing = gridContentDraftByIdRef.current[objectItem.id];
      if (existing) {
        return existing;
      }

      return buildGridDraft(objectItem);
    },
    [buildGridDraft],
  );

  const flushGridContentSync = useCallback(
    async (objectId: string, nextDraft?: GridContainerContentDraft) => {
      if (!canEditRef.current) {
        return;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "gridContainer") {
        return;
      }

      const draft = nextDraft ?? gridContentDraftByIdRef.current[objectId];
      if (!draft) {
        return;
      }

      const normalizedDraft: GridContainerContentDraft = {
        containerTitle: draft.containerTitle.trim().slice(0, 120),
        sectionTitles: draft.sectionTitles.map((value, index) => {
          const trimmed = value.trim();
          return (trimmed.length > 0 ? trimmed : `Section ${index + 1}`).slice(
            0,
            80,
          );
        }),
        sectionNotes: draft.sectionNotes.map((value) => value.slice(0, 600)),
      };

      const latestObject = objectsByIdRef.current.get(objectId);
      if (!latestObject || latestObject.type !== "gridContainer") {
        return;
      }
      const latestBaseline = buildGridDraft(latestObject);
      const hasNoopWrite =
        latestBaseline.containerTitle === normalizedDraft.containerTitle &&
        JSON.stringify(latestBaseline.sectionTitles) ===
          JSON.stringify(normalizedDraft.sectionTitles) &&
        JSON.stringify(latestBaseline.sectionNotes) ===
          JSON.stringify(normalizedDraft.sectionNotes);
      if (hasNoopWrite) {
        return;
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          containerTitle: normalizedDraft.containerTitle,
          gridSectionTitles: normalizedDraft.sectionTitles,
          gridSectionNotes: normalizedDraft.sectionNotes,
          updatedAt: serverTimestamp(),
        });
        setGridContentDraftById((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
      } catch (error) {
        console.error("Failed to update grid container content", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update grid container content.",
          ),
        );
      }
    },
    [boardId, buildGridDraft, db],
  );

  const queueGridContentSync = useCallback(
    (
      objectId: string,
      nextDraft: GridContainerContentDraft,
      options?: { immediate?: boolean },
    ) => {
      setGridContentDraftById((previous) => ({
        ...previous,
        [objectId]: nextDraft,
      }));

      const existingTimer = gridContentSyncTimerByIdRef.current.get(objectId);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }

      if (options?.immediate) {
        gridContentSyncTimerByIdRef.current.delete(objectId);
        void flushGridContentSync(objectId, nextDraft);
        return;
      }

      const nextTimerId = window.setTimeout(() => {
        gridContentSyncTimerByIdRef.current.delete(objectId);
        void flushGridContentSync(objectId, nextDraft);
      }, STICKY_TEXT_SYNC_THROTTLE_MS);
      gridContentSyncTimerByIdRef.current.set(objectId, nextTimerId);
    },
    [flushGridContentSync],
  );

  const updateGridContainerDimensions = useCallback(
    async (objectId: string, nextRowsRaw: number, nextColsRaw: number) => {
      if (!canEditRef.current) {
        return;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "gridContainer") {
        return;
      }

      const nextRows = Math.max(
        1,
        Math.min(GRID_CONTAINER_MAX_ROWS, Math.floor(nextRowsRaw)),
      );
      const nextCols = Math.max(
        1,
        Math.min(GRID_CONTAINER_MAX_COLS, Math.floor(nextColsRaw)),
      );
      const currentRows = Math.max(1, objectItem.gridRows ?? 2);
      const currentCols = Math.max(1, objectItem.gridCols ?? 2);
      if (nextRows === currentRows && nextCols === currentCols) {
        return;
      }

      const sectionCount = nextRows * nextCols;
      const fallbackTitles = getDefaultSectionTitles(nextRows, nextCols);
      const currentDraft = getGridDraftForObject(objectItem);
      const nextSectionTitles = normalizeSectionValues(
        currentDraft.sectionTitles,
        sectionCount,
        (index) => fallbackTitles[index] ?? `Section ${index + 1}`,
        80,
      );
      const nextSectionNotes = normalizeSectionValues(
        currentDraft.sectionNotes,
        sectionCount,
        () => "",
        600,
      );

      const palette =
        objectItem.gridCellColors && objectItem.gridCellColors.length > 0
          ? objectItem.gridCellColors
          : ["#d1fae5", "#fee2e2", "#dbeafe", "#fef3c7"];
      const nextCellColors = Array.from(
        { length: sectionCount },
        (_, index) => palette[index % palette.length] ?? "#e2e8f0",
      );
      const geometry = getCurrentObjectGeometry(objectId) ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
      const nextGap = Math.max(
        0,
        objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
      );
      const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
        objectId,
        geometry,
        nextRows,
        nextCols,
        nextGap,
      );
      const membershipByObjectId = buildContainerMembershipPatchesForPositions(
        childUpdates.positionByObjectId,
        childUpdates.membershipByObjectId,
      );

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          gridRows: nextRows,
          gridCols: nextCols,
          gridSectionTitles: nextSectionTitles,
          gridSectionNotes: nextSectionNotes,
          gridCellColors: nextCellColors,
          updatedAt: serverTimestamp(),
        });
        setGridContentDraftById((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });

        const childIds = Object.keys(childUpdates.positionByObjectId);
        if (childIds.length > 0) {
          await updateObjectPositionsBatch(childUpdates.positionByObjectId, {
            includeUpdatedAt: true,
            force: true,
            containerMembershipById: membershipByObjectId,
          });
        }
      } catch (error) {
        console.error("Failed to update grid container dimensions", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update grid container dimensions.",
          ),
        );
      }
    },
    [
      boardId,
      buildContainerMembershipPatchesForPositions,
      db,
      getCurrentObjectGeometry,
      getGridDraftForObject,
      getSectionAnchoredObjectUpdatesForContainer,
      updateObjectPositionsBatch,
    ],
  );

  const saveSelectedObjectsColor = useCallback(
    async (color: string) => {
      if (!canEditRef.current) {
        return;
      }

      const objectIdsToUpdate = Array.from(selectedObjectIdsRef.current).filter(
        (objectId) => {
          const objectItem = objectsByIdRef.current.get(objectId);
          return objectItem ? canUseSelectionHudColor(objectItem) : false;
        },
      );
      if (objectIdsToUpdate.length === 0) {
        return;
      }

      try {
        const batch = writeBatch(db);
        const updatedAt = serverTimestamp();

        objectIdsToUpdate.forEach((objectId) => {
          batch.update(doc(db, `boards/${boardId}/objects/${objectId}`), {
            color,
            updatedAt,
          });
        });

        await batch.commit();
      } catch (error) {
        console.error("Failed to update selected object colors", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update selected object colors.",
          ),
        );
      }
    },
    [boardId, db],
  );

  const resetSelectedObjectsRotation = useCallback(async () => {
    if (!canEditRef.current) {
      return;
    }

    const targets = Array.from(selectedObjectIdsRef.current)
      .map((objectId) => {
        const geometry = getCurrentObjectGeometry(objectId);
        if (!geometry) {
          return null;
        }

        return { objectId, geometry };
      })
      .filter(
        (
          item,
        ): item is {
          objectId: string;
          geometry: ObjectGeometry;
        } => item !== null,
      )
      .filter((item) => hasMeaningfulRotation(item.geometry.rotationDeg));

    if (targets.length === 0) {
      return;
    }

    rotateStateRef.current = null;

    targets.forEach((target) => {
      setDraftGeometry(target.objectId, {
        ...target.geometry,
        rotationDeg: 0,
      });
    });

    try {
      const batch = writeBatch(db);
      const updatedAt = serverTimestamp();

      targets.forEach((target) => {
        batch.update(doc(db, `boards/${boardId}/objects/${target.objectId}`), {
          x: target.geometry.x,
          y: target.geometry.y,
          width: target.geometry.width,
          height: target.geometry.height,
          rotationDeg: 0,
          updatedAt,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Failed to reset selected object rotation", error);
      setBoardError(
        toBoardErrorMessage(error, "Failed to reset selected object rotation."),
      );
    } finally {
      targets.forEach((target) => {
        window.setTimeout(() => {
          clearDraftGeometry(target.objectId);
        }, 180);
      });
    }
  }, [
    boardId,
    clearDraftGeometry,
    db,
    getCurrentObjectGeometry,
    setDraftGeometry,
  ]);

  const selectSingleObject = useCallback((objectId: string) => {
    setSelectedObjectIds((previous) =>
      previous.length === 1 && previous[0] === objectId ? previous : [objectId],
    );
  }, []);

  const toggleObjectSelection = useCallback((objectId: string) => {
    setSelectedObjectIds((previous) => {
      if (previous.includes(objectId)) {
        return previous.filter((id) => id !== objectId);
      }

      return [...previous, objectId];
    });
  }, []);

  const handleDeleteSelectedObjects = useCallback(() => {
    if (!canEdit || selectedObjectIds.length === 0) {
      return;
    }

    const objectIdsToDelete = [...selectedObjectIds];
    void Promise.all(
      objectIdsToDelete.map((objectId) => deleteObject(objectId)),
    );
  }, [canEdit, deleteObject, selectedObjectIds]);

  const handleToolButtonClick = useCallback(
    (toolKind: BoardObjectKind) => {
      void createObject(toolKind);
    },
    [createObject],
  );

  const handleDeleteButtonClick = useCallback(() => {
    handleDeleteSelectedObjects();
  }, [handleDeleteSelectedObjects]);

  const handleAiFooterResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || isAiFooterCollapsed) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      aiFooterResizeStateRef.current = {
        startClientY: event.clientY,
        initialHeight: aiFooterHeight,
      };
      setIsAiFooterResizing(true);
    },
    [aiFooterHeight, isAiFooterCollapsed],
  );

  const submitAiCommandMessage = useCallback(
    async (
      nextMessage: string,
      options?: { appendUserMessage?: boolean; clearInput?: boolean },
    ) => {
      const appendUserMessage = options?.appendUserMessage ?? true;
      const clearInput = options?.clearInput ?? false;
      const trimmedMessage = nextMessage.trim();
      if (trimmedMessage.length === 0 || isAiSubmitting) {
        return;
      }

      if (appendUserMessage) {
        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId("u"),
            role: "user",
            text: nextMessage,
          },
        ]);

        setChatInputHistory((previous) => {
          const filtered = previous.filter((item) => item !== nextMessage);
          filtered.push(nextMessage);
          return filtered.slice(-50);
        });
        setChatInputHistoryIndex(-1);
        chatInputHistoryDraftRef.current = "";
      }
      if (clearInput) {
        setChatInput("");
        setChatInputHistoryIndex(-1);
        chatInputHistoryDraftRef.current = "";
      }

      const localCommand = trimmedMessage.toLowerCase();
      const localCommandResponse =
        localCommand === "/help" ||
        localCommand === "/commands" ||
        localCommand === "help" ||
        localCommand === "commands" ||
        localCommand === "/?"
          ? AI_HELP_MESSAGE
          : null;
      if (localCommandResponse) {
        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId("a"),
            role: "assistant",
            text: localCommandResponse,
          },
        ]);
        return;
      }

      setIsAiSubmitting(true);

      const applySelectionUpdate = (
        selectionUpdate?: {
          mode: "clear" | "replace";
          objectIds: string[];
        },
      ): void => {
        if (!selectionUpdate) {
          return;
        }

        const objectIdsInBoard = new Set(objects.map((item) => item.id));
        const normalized = Array.from(
          new Set(
            selectionUpdate.objectIds
              .filter((id) => objectIdsInBoard.has(id))
              .map((id) => id.trim())
              .filter(Boolean),
          ),
        );

        if (selectionUpdate.mode === "clear") {
          setSelectedObjectIds([]);
          return;
        }

        setSelectedObjectIds(normalized);
      };

      try {
        const idToken = idTokenRef.current ?? (await user.getIdToken());
        idTokenRef.current = idToken;
        const stageElement = stageRef.current;
        const viewportBounds = stageElement
          ? {
              left: -viewportRef.current.x / viewportRef.current.scale,
              top: -viewportRef.current.y / viewportRef.current.scale,
              width: stageElement.clientWidth / viewportRef.current.scale,
              height: stageElement.clientHeight / viewportRef.current.scale,
            }
          : undefined;

        const response = await fetch("/api/ai/board-command", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            boardId,
            message: nextMessage,
            selectedObjectIds: Array.from(selectedObjectIdsRef.current),
            viewportBounds,
          }),
        });

        if (!response.ok) {
          let apiErrorMessage: string | undefined;
          try {
            const payload = (await response.json()) as { error?: unknown };
            if (
              typeof payload.error === "string" &&
              payload.error.trim().length > 0
            ) {
              apiErrorMessage = payload.error;
            }
          } catch {
            apiErrorMessage = undefined;
          }
          const assistantMessage = getBoardCommandErrorMessage({
            status: response.status,
          });
          const chatErrorText =
            response.status === 504
              ? assistantMessage
              : apiErrorMessage ?? assistantMessage;
          setChatMessages((previous) => [
            ...previous,
            {
              id: createChatMessageId("a"),
              role: "assistant",
              text: chatErrorText,
            },
          ]);
          return;
        }

        const payload = (await response.json()) as {
          assistantMessage?: unknown;
          selectionUpdate?: {
            mode: "clear" | "replace";
            objectIds: string[];
          };
        };
        const assistantMessage =
          typeof payload.assistantMessage === "string" &&
          payload.assistantMessage.trim()
            ? payload.assistantMessage
            : "AI agent coming soon!";
        applySelectionUpdate(payload.selectionUpdate);

        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId("a"),
            role: "assistant",
            text: assistantMessage,
          },
        ]);
      } catch {
        const assistantMessage = getBoardCommandErrorMessage({
          status: null,
        });

        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId("a"),
            role: "assistant",
            text: assistantMessage,
          },
        ]);
      } finally {
        setIsAiSubmitting(false);
      }
    },
    [boardId, isAiSubmitting, objects, user],
  );

  const handleAiChatSubmit = useCallback(
    (event: ReactFormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextMessage = chatInput.trim();
      if (nextMessage.length === 0 || isAiSubmitting) {
        return;
      }
      void submitAiCommandMessage(nextMessage, {
        appendUserMessage: true,
        clearInput: true,
      });
    },
    [chatInput, isAiSubmitting, submitAiCommandMessage],
  );

  const handleChatInputChange = useCallback(
    (event: ReactChangeEvent<HTMLInputElement>) => {
      setChatInput(event.target.value);
      setChatInputHistoryIndex(-1);
      chatInputHistoryDraftRef.current = event.target.value;
    },
    [],
  );

  const handleChatInputKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      if (chatInputHistory.length === 0 || isAiSubmitting) {
        return;
      }

      event.preventDefault();

      if (event.key === "ArrowUp") {
        const nextIndex =
          chatInputHistoryIndex < 0
            ? chatInputHistory.length - 1
            : Math.max(0, chatInputHistoryIndex - 1);

        if (chatInputHistoryIndex < 0) {
          chatInputHistoryDraftRef.current = chatInput;
        }

        setChatInputHistoryIndex(nextIndex);
        setChatInput(chatInputHistory[nextIndex] ?? "");
        return;
      }

      if (chatInputHistoryIndex < 0) {
        return;
      }

      if (chatInputHistoryIndex >= chatInputHistory.length - 1) {
        setChatInputHistoryIndex(-1);
        setChatInput(chatInputHistoryDraftRef.current);
        return;
      }

      const nextIndex = chatInputHistoryIndex + 1;
      setChatInputHistoryIndex(nextIndex);
      setChatInput(chatInputHistory[nextIndex] ?? "");
    },
    [
      chatInput,
      chatInputHistory,
      chatInputHistoryIndex,
      isAiSubmitting,
    ],
  );

  const persistObjectLabelText = useCallback(
    async (objectId: string, nextText: string) => {
      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isLabelEditableObjectType(objectItem.type)) {
        return;
      }

      const previousText = objectItem.text ?? "";
      if (nextText === previousText) {
        return;
      }

      setObjects((previous) =>
        previous.map((item) =>
          item.id === objectId
            ? {
                ...item,
                text: nextText,
              }
            : item,
        ),
      );

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: nextText,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        setObjects((previous) =>
          previous.map((item) =>
            item.id === objectId
              ? {
                  ...item,
                  text: previousText,
                }
              : item,
          ),
        );
        setBoardError(toBoardErrorMessage(error, "Failed to update label."));
      }
    },
    [boardId, db],
  );

  const handleCreateSwotButtonClick = useCallback(() => {
    if (!canEdit || isAiSubmitting || isSwotTemplateCreating) {
      return;
    }

    void (async () => {
      setIsAiSubmitting(false);
      setIsSwotTemplateCreating(true);

      try {
        const swotObjectId = await createSwotTemplate();

        if (!swotObjectId) {
          return;
        }

        setChatMessages((previous) => [
          ...previous,
          {
            id: createChatMessageId("a"),
            role: "assistant",
            text: "Created SWOT analysis template.",
          },
        ]);
        setSelectedObjectIds([swotObjectId]);
      } finally {
        setIsSwotTemplateCreating(false);
        setIsAiSubmitting(false);
        setChatInputHistoryIndex(-1);
        chatInputHistoryDraftRef.current = "";
      }
    })();
  }, [canEdit, isAiSubmitting, createSwotTemplate, isSwotTemplateCreating]);

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-selection-hud='true']")) {
        return;
      }

      if (target.closest("[data-board-object='true']")) {
        return;
      }

      const isRemoveMarquee = event.ctrlKey || event.metaKey;
      const isAddMarquee = event.shiftKey;

      if (isAddMarquee || isRemoveMarquee) {
        const startPoint = toBoardCoordinates(event.clientX, event.clientY);
        if (!startPoint) {
          return;
        }

        const nextMarqueeState: MarqueeSelectionState = {
          startPoint,
          currentPoint: startPoint,
          mode: isRemoveMarquee ? "remove" : "add",
        };

        marqueeSelectionStateRef.current = nextMarqueeState;
        setMarqueeSelectionState(nextMarqueeState);
        return;
      }

      setSelectedObjectIds([]);

      panStateRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialX: viewportRef.current.x,
        initialY: viewportRef.current.y,
      };
    },
    [toBoardCoordinates],
  );

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextPoint = toBoardCoordinates(event.clientX, event.clientY);
      if (nextPoint) {
        setCursorBoardPosition((previous) => {
          const nextRounded = {
            x: Math.round(nextPoint.x),
            y: Math.round(nextPoint.y),
          };
          if (
            previous &&
            previous.x === nextRounded.x &&
            previous.y === nextRounded.y
          ) {
            return previous;
          }
          return nextRounded;
        });
      }

      const now = Date.now();
      if (now - sendCursorAtRef.current < CURSOR_THROTTLE_MS) {
        return;
      }

      sendCursorAtRef.current = now;
      if (!nextPoint) {
        return;
      }

      void updateCursor(nextPoint);
    },
    [toBoardCoordinates, updateCursor],
  );

  const handleStagePointerLeave = useCallback(() => {
    setCursorBoardPosition(null);
    void updateCursor(null, { force: true });
  }, [updateCursor]);

  const setScaleAtClientPoint = useCallback(
    (clientX: number, clientY: number, targetScale: number) => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;

      const current = viewportRef.current;
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      const nextScale = clampScale(targetScale);

      if (nextScale === current.scale) {
        return;
      }

      const nextX = pointerX - worldX * nextScale;
      const nextY = pointerY - worldY * nextScale;

      setViewport({
        x: nextX,
        y: nextY,
        scale: nextScale,
      });
    },
    [],
  );

  const zoomAtPointer = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const effectiveDeltaY = getAcceleratedWheelZoomDelta(deltaY);
      const zoomFactor = Math.exp(-effectiveDeltaY * ZOOM_WHEEL_INTENSITY);
      const nextScale = clampScale(viewportRef.current.scale * zoomFactor);
      setScaleAtClientPoint(clientX, clientY, nextScale);
    },
    [setScaleAtClientPoint],
  );

  const zoomAtStageCenter = useCallback(
    (targetScale: number) => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      setScaleAtClientPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        targetScale,
      );
    },
    [setScaleAtClientPoint],
  );

  const nudgeZoom = useCallback(
    (direction: "in" | "out") => {
      const deltaPercent =
        direction === "in"
          ? ZOOM_BUTTON_STEP_PERCENT
          : -ZOOM_BUTTON_STEP_PERCENT;
      const nextPercent =
        Math.round(viewportRef.current.scale * 100) + deltaPercent;
      zoomAtStageCenter(nextPercent / 100);
    },
    [zoomAtStageCenter],
  );

  const panByWheel = useCallback((deltaX: number, deltaY: number) => {
    setViewport((previous) => ({
      x: previous.x - deltaX,
      y: previous.y - deltaY,
      scale: previous.scale,
    }));
  }, []);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    /**
     * Handles handle native wheel.
     */
    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.ctrlKey || event.metaKey) {
        zoomAtPointer(event.clientX, event.clientY, event.deltaY);
        return;
      }

      panByWheel(event.deltaX, event.deltaY);
    };

    stageElement.addEventListener("wheel", handleNativeWheel, {
      passive: false,
    });

    return () => {
      stageElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [panByWheel, zoomAtPointer]);

  const startObjectDrag = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        toggleObjectSelection(objectId);
        return;
      }

      const sourceObject = objectsByIdRef.current.get(objectId);
      if (sourceObject && isConnectorKind(sourceObject.type)) {
        selectSingleObject(objectId);
        return;
      }

      const currentSelectedIds = selectedObjectIdsRef.current;
      const shouldPrepareGroupDrag =
        currentSelectedIds.has(objectId) && currentSelectedIds.size > 1;
      const dragObjectIds = (
        shouldPrepareGroupDrag ? Array.from(currentSelectedIds) : [objectId]
      ).filter((candidateId) => {
        const candidateObject = objectsByIdRef.current.get(candidateId);
        return candidateObject ? !isConnectorKind(candidateObject.type) : false;
      });

      if (!shouldPrepareGroupDrag) {
        selectSingleObject(objectId);
      }

      const initialGeometries: Record<string, ObjectGeometry> = {};
      dragObjectIds.forEach((candidateId) => {
        const geometry = getCurrentObjectGeometry(candidateId);
        if (geometry) {
          initialGeometries[candidateId] = geometry;
        }
      });

      const availableObjectIds = Object.keys(initialGeometries);
      if (availableObjectIds.length === 0) {
        return;
      }

      setIsObjectDragging(true);
      dragStateRef.current = {
        objectIds: availableObjectIds,
        initialGeometries,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastSentAt: 0,
        hasMoved: false,
        collapseToObjectIdOnClick: shouldPrepareGroupDrag ? objectId : null,
      };
    },
    [
      canEdit,
      getCurrentObjectGeometry,
      selectSingleObject,
      toggleObjectSelection,
    ],
  );

  const startShapeRotate = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (
        !objectItem ||
        !isConnectableShapeKind(objectItem.type) ||
        objectItem.type === "gridContainer"
      ) {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      const pointer = toBoardCoordinates(event.clientX, event.clientY);
      if (!pointer) {
        return;
      }

      const centerPoint = {
        x: geometry.x + geometry.width / 2,
        y: geometry.y + geometry.height / 2,
      };
      const initialPointerAngleDeg = toDegrees(
        Math.atan2(pointer.y - centerPoint.y, pointer.x - centerPoint.x),
      );

      selectSingleObject(objectId);
      rotateStateRef.current = {
        objectId,
        centerPoint,
        initialPointerAngleDeg,
        initialRotationDeg: geometry.rotationDeg,
        lastSentAt: 0,
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject, toBoardCoordinates],
  );

  const startCornerResize = useCallback(
    (
      objectId: string,
      corner: ResizeCorner,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isConnectableShapeKind(objectItem.type)) {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      selectSingleObject(objectId);
      cornerResizeStateRef.current = {
        objectId,
        objectType: objectItem.type,
        corner,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialGeometry: geometry,
        lastSentAt: 0,
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject],
  );

  const startLineEndpointResize = useCallback(
    (
      objectId: string,
      endpoint: LineEndpoint,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "line") {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      const endpoints = getLineEndpoints(geometry);
      const fixedPoint = endpoint === "start" ? endpoints.end : endpoints.start;

      selectSingleObject(objectId);
      lineEndpointResizeStateRef.current = {
        objectId,
        endpoint,
        fixedPoint,
        handleHeight: geometry.height,
        lastSentAt: 0,
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject],
  );

  const startConnectorEndpointDrag = useCallback(
    (
      objectId: string,
      endpoint: ConnectorEndpoint,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isConnectorKind(objectItem.type)) {
        return;
      }

      const currentDraft = getConnectorDraftForObject(objectItem);
      if (!currentDraft) {
        return;
      }

      setDraftConnector(objectId, currentDraft);
      selectSingleObject(objectId);
      connectorEndpointDragStateRef.current = {
        objectId,
        endpoint,
        lastSentAt: 0,
      };
    },
    [
      canEdit,
      getConnectorDraftForObject,
      selectSingleObject,
      setDraftConnector,
    ],
  );

  const onlineUsers = useMemo(
    () =>
      getActivePresenceUsers(
        presenceUsers,
        presenceClock,
        PRESENCE_TTL_MS,
      ).sort((left, right) =>
        getPresenceLabel(left).localeCompare(getPresenceLabel(right)),
      ),
    [presenceClock, presenceUsers],
  );

  const remoteCursors = useMemo(
    () => getRemoteCursors(onlineUsers, user.uid),
    [onlineUsers, user.uid],
  );

  const selectedObjectCount = selectedObjectIds.length;
  const selectedObjects = useMemo(
    () =>
      selectedObjectIds
        .map((objectId) => {
          const objectItem = objects.find(
            (candidate) => candidate.id === objectId,
          );
          if (!objectItem) {
            return null;
          }

          const draftGeometry = draftGeometryById[objectId];
          const geometry: ObjectGeometry = draftGeometry ?? {
            x: objectItem.x,
            y: objectItem.y,
            width: objectItem.width,
            height: objectItem.height,
            rotationDeg: objectItem.rotationDeg,
          };

          return {
            object: objectItem,
            geometry,
          };
        })
        .filter(
          (
            item,
          ): item is {
            object: BoardObject;
            geometry: ObjectGeometry;
          } => item !== null,
        ),
    [draftGeometryById, objects, selectedObjectIds],
  );
  const connectableGeometryById = useMemo(() => {
    const geometries = new Map<string, ObjectGeometry>();
    objects.forEach((objectItem) => {
      if (!isConnectableShapeKind(objectItem.type)) {
        return;
      }

      const draftGeometry = draftGeometryById[objectItem.id];
      geometries.set(
        objectItem.id,
        draftGeometry ?? {
          x: objectItem.x,
          y: objectItem.y,
          width: objectItem.width,
          height: objectItem.height,
          rotationDeg: objectItem.rotationDeg,
        },
      );
    });
    return geometries;
  }, [draftGeometryById, objects]);
  const connectableTypeById = useMemo(() => {
    const types = new Map<
      string,
      Exclude<
        BoardObjectKind,
        | "line"
        | "connectorUndirected"
        | "connectorArrow"
        | "connectorBidirectional"
      >
    >();
    objects.forEach((objectItem) => {
      if (isConnectableShapeKind(objectItem.type)) {
        types.set(objectItem.id, objectItem.type);
      }
    });
    return types;
  }, [objects]);
  const connectorRoutingObstacles = useMemo(
    () =>
      Array.from(connectableGeometryById.entries())
        .map(([objectId, geometry]) => {
          const objectType = connectableTypeById.get(objectId);
          if (!objectType) {
            return null;
          }

          return {
            objectId,
            bounds: inflateObjectBounds(
              getObjectVisualBounds(objectType, geometry),
              14,
            ),
          };
        })
        .filter((item): item is ConnectorRoutingObstacle => item !== null),
    [connectableGeometryById, connectableTypeById],
  );
  const connectorRoutesById = useMemo(() => {
    const routes = new Map<
      string,
      {
        resolved: {
          from: ResolvedConnectorEndpoint;
          to: ResolvedConnectorEndpoint;
          draft: ConnectorDraft;
        };
        geometry: ConnectorRouteGeometry;
      }
    >();

    objects.forEach((objectItem) => {
      if (!isConnectorKind(objectItem.type)) {
        return;
      }

      const localDraft = draftConnectorById[objectItem.id] ?? null;
      const connectorGeometryDraft = draftGeometryById[objectItem.id] ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
      const defaultFromX =
        objectItem.fromX ??
        connectorGeometryDraft.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.width) *
            0.1;
      const defaultFromY =
        objectItem.fromY ??
        connectorGeometryDraft.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.height) *
            0.5;
      const defaultToX =
        objectItem.toX ??
        connectorGeometryDraft.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.width) *
            0.9;
      const defaultToY =
        objectItem.toY ??
        connectorGeometryDraft.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.height) *
            0.5;
      const connectorDraft: ConnectorDraft = localDraft ?? {
        fromObjectId: objectItem.fromObjectId ?? null,
        toObjectId: objectItem.toObjectId ?? null,
        fromAnchor: objectItem.fromAnchor ?? null,
        toAnchor: objectItem.toAnchor ?? null,
        fromX: defaultFromX,
        fromY: defaultFromY,
        toX: defaultToX,
        toY: defaultToY,
      };
      const activeEndpointDrag = connectorEndpointDragStateRef.current;

      /**
       * Builds endpoint candidates.
       */
      const buildEndpointCandidates = (
        endpoint: "from" | "to",
      ): ResolvedConnectorEndpoint[] => {
        const objectId =
          endpoint === "from"
            ? connectorDraft.fromObjectId
            : connectorDraft.toObjectId;
        const fallbackPoint =
          endpoint === "from"
            ? { x: connectorDraft.fromX, y: connectorDraft.fromY }
            : { x: connectorDraft.toX, y: connectorDraft.toY };
        const selectedAnchor =
          endpoint === "from"
            ? connectorDraft.fromAnchor
            : connectorDraft.toAnchor;

        if (!objectId) {
          return [
            {
              x: fallbackPoint.x,
              y: fallbackPoint.y,
              objectId: null,
              anchor: null,
              direction: null,
              connected: false,
            },
          ];
        }

        const endpointGeometry = connectableGeometryById.get(objectId);
        if (!endpointGeometry) {
          return [
            {
              x: fallbackPoint.x,
              y: fallbackPoint.y,
              objectId: null,
              anchor: null,
              direction: null,
              connected: false,
            },
          ];
        }
        const endpointType = connectableTypeById.get(objectId) ?? "rect";

        const isDraggingThisEndpoint =
          activeEndpointDrag?.objectId === objectItem.id &&
          activeEndpointDrag.endpoint === endpoint;
        const anchors =
          isDraggingThisEndpoint && selectedAnchor
            ? [selectedAnchor]
            : selectedAnchor
              ? [
                  selectedAnchor,
                  ...CONNECTOR_ANCHORS.filter(
                    (anchor) => anchor !== selectedAnchor,
                  ),
                ]
              : [...CONNECTOR_ANCHORS];

        return anchors.map((anchor) => {
          const point = getAnchorPointForGeometry(
            endpointGeometry,
            anchor,
            endpointType,
          );
          return {
            x: point.x,
            y: point.y,
            objectId,
            anchor,
            direction: getAnchorDirectionForGeometry(anchor, endpointGeometry),
            connected: true,
          };
        });
      };

      const fromCandidates = buildEndpointCandidates("from");
      const toCandidates = buildEndpointCandidates("to");
      let bestResolved: {
        from: ResolvedConnectorEndpoint;
        to: ResolvedConnectorEndpoint;
      } | null = null;
      let bestGeometry: ConnectorRouteGeometry | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      for (const fromCandidate of fromCandidates) {
        for (const toCandidate of toCandidates) {
          if (
            fromCandidate.connected &&
            toCandidate.connected &&
            fromCandidate.objectId === toCandidate.objectId &&
            fromCandidate.anchor === toCandidate.anchor
          ) {
            continue;
          }

          const obstacles = connectorRoutingObstacles.filter(
            (obstacle) =>
              obstacle.objectId !== fromCandidate.objectId &&
              obstacle.objectId !== toCandidate.objectId,
          );
          const geometry = buildConnectorRouteGeometry({
            from: fromCandidate,
            to: toCandidate,
            obstacles,
            padding: CONNECTOR_HIT_PADDING,
          });

          let score = scoreConnectorRoute(geometry.points, obstacles);
          score += scoreEndpointDirectionAlignment(
            fromCandidate,
            toCandidate,
            fromCandidate.direction,
            toCandidate.direction,
          );
          if (
            fromCandidate.connected &&
            connectorDraft.fromAnchor &&
            fromCandidate.anchor !== connectorDraft.fromAnchor
          ) {
            score += 14;
          }
          if (
            toCandidate.connected &&
            connectorDraft.toAnchor &&
            toCandidate.anchor !== connectorDraft.toAnchor
          ) {
            score += 14;
          }

          if (
            fromCandidate.connected &&
            toCandidate.connected &&
            fromCandidate.objectId === toCandidate.objectId
          ) {
            score += 300;
          }

          if (score < bestScore) {
            bestScore = score;
            bestResolved = {
              from: fromCandidate,
              to: toCandidate,
            };
            bestGeometry = geometry;
          }
        }
      }

      if (!bestResolved || !bestGeometry) {
        return;
      }

      routes.set(objectItem.id, {
        resolved: {
          from: bestResolved.from,
          to: bestResolved.to,
          draft: connectorDraft,
        },
        geometry: bestGeometry,
      });
    });

    return routes;
  }, [
    connectableGeometryById,
    connectableTypeById,
    connectorRoutingObstacles,
    draftConnectorById,
    draftGeometryById,
    objects,
  ]);
  const selectedObjectBounds = useMemo(
    () =>
      mergeBounds(
        selectedObjects.map((selectedObject) => {
          if (isConnectorKind(selectedObject.object.type)) {
            const routed = connectorRoutesById.get(selectedObject.object.id);
            if (routed) {
              return routed.geometry.bounds;
            }
          }

          return getObjectVisualBounds(
            selectedObject.object.type,
            selectedObject.geometry,
          );
        }),
      ),
    [connectorRoutesById, selectedObjects],
  );
  const selectedConnectorMidpoint = useMemo(() => {
    if (selectedObjects.length !== 1) {
      return null;
    }

    const selectedObject = selectedObjects[0];
    if (!selectedObject || !isConnectorKind(selectedObject.object.type)) {
      return null;
    }

    const routed = connectorRoutesById.get(selectedObject.object.id);
    if (!routed) {
      return null;
    }

    return routed.geometry.midPoint;
  }, [connectorRoutesById, selectedObjects]);
  const selectedColorableObjects = useMemo(
    () =>
      selectedObjects.filter((selectedObject) =>
        canUseSelectionHudColor(selectedObject.object),
      ),
    [selectedObjects],
  );
  const selectedColor = useMemo(() => {
    if (selectedColorableObjects.length === 0) {
      return null;
    }

    const firstColor = selectedColorableObjects[0].object.color.toLowerCase();
    const hasMixedColors = selectedColorableObjects.some(
      (selectedObject) =>
        selectedObject.object.color.toLowerCase() !== firstColor,
    );

    return hasMixedColors ? null : selectedColorableObjects[0].object.color;
  }, [selectedColorableObjects]);
  const canColorSelection = canEdit && selectedColorableObjects.length > 0;
  const canResetSelectionRotation =
    canEdit &&
    selectedObjects.some((selectedObject) =>
      hasMeaningfulRotation(selectedObject.geometry.rotationDeg),
    );
  const singleSelectedObject =
    selectedObjects.length === 1 ? (selectedObjects[0]?.object ?? null) : null;
  const canEditSelectedLabel =
    canEdit &&
    singleSelectedObject !== null &&
    isLabelEditableObjectType(singleSelectedObject.type);
  const canShowSelectionHud = canColorSelection || canEditSelectedLabel;
  const commitSelectionLabelDraft = useCallback(async () => {
    if (!canEditSelectedLabel || !singleSelectedObject) {
      return;
    }

    const trimmed = selectionLabelDraft.trim();
    const nextText =
      trimmed.length === 0 ? "" : trimmed.slice(0, OBJECT_LABEL_MAX_LENGTH);
    setSelectionLabelDraft(nextText);
    await persistObjectLabelText(singleSelectedObject.id, nextText);
  }, [
    canEditSelectedLabel,
    persistObjectLabelText,
    selectionLabelDraft,
    singleSelectedObject,
  ]);
  const preferSidePlacement =
    singleSelectedObject !== null &&
    singleSelectedObject.type !== "line" &&
    !isConnectorKind(singleSelectedObject.type);
  const selectionHudPosition = useMemo(() => {
    return calculateSelectionHudPosition({
      canShowHud: canShowSelectionHud,
      selectedObjectBounds,
      stageSize,
      viewport,
      selectionHudSize,
      selectedConnectorMidpoint,
      preferSidePlacement,
    });
  }, [
    canShowSelectionHud,
    preferSidePlacement,
    selectedConnectorMidpoint,
    selectedObjectBounds,
    selectionHudSize,
    stageSize,
    viewport,
  ]);
  useEffect(() => {
    if (!canEditSelectedLabel || !singleSelectedObject) {
      setSelectionLabelDraft("");
      return;
    }

    setSelectionLabelDraft(singleSelectedObject.text ?? "");
  }, [canEditSelectedLabel, singleSelectedObject]);

  const hasDeletableSelection = useMemo(
    () =>
      canEdit &&
      selectedObjectIds.length > 0 &&
      objects.some((item) => selectedObjectIds.includes(item.id)),
    [canEdit, objects, selectedObjectIds],
  );
  const hasSelectedConnector = useMemo(
    () =>
      selectedObjectIds.some((objectId) => {
        const item = objects.find((candidate) => candidate.id === objectId);
        return item ? isConnectorKind(item.type) : false;
      }),
    [objects, selectedObjectIds],
  );
  const isConnectorEndpointDragging =
    connectorEndpointDragStateRef.current !== null;
  const shouldShowConnectorAnchors =
    canEdit && (hasSelectedConnector || isConnectorEndpointDragging);
  const connectorAnchorPoints = shouldShowConnectorAnchors
    ? getConnectableAnchorPoints()
    : [];

  useEffect(() => {
    if (!canShowSelectionHud) {
      setSelectionHudSize((previous) =>
        previous.width === 0 && previous.height === 0
          ? previous
          : { width: 0, height: 0 },
      );
      return;
    }

    const hudElement = selectionHudRef.current;
    if (!hudElement) {
      return;
    }

    /**
     * Handles sync hud size.
     */
    const syncHudSize = () => {
      const nextWidth = hudElement.offsetWidth;
      const nextHeight = hudElement.offsetHeight;
      setSelectionHudSize((previous) =>
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight },
      );
    };

    syncHudSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncHudSize();
    });
    resizeObserver.observe(hudElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    canEditSelectedLabel,
    canResetSelectionRotation,
    canShowSelectionHud,
    selectedColor,
  ]);

  const zoomPercent = Math.round(viewport.scale * 100);
  const zoomSliderValue = Math.min(
    ZOOM_SLIDER_MAX_PERCENT,
    Math.max(ZOOM_SLIDER_MIN_PERCENT, zoomPercent),
  );
  const marqueeRect = marqueeSelectionState
    ? toNormalizedRect(
        marqueeSelectionState.startPoint,
        marqueeSelectionState.currentPoint,
      )
    : null;
  const gridAxisLabels = useMemo(() => {
    if (
      stageSize.width <= 0 ||
      stageSize.height <= 0 ||
      viewport.scale <= 0 ||
      !Number.isFinite(viewport.scale)
    ) {
      return {
        xLabels: [] as Array<{ screen: number; value: number }>,
        yLabels: [] as Array<{ screen: number; value: number }>,
      };
    }

    const worldLeft = (-viewport.x) / viewport.scale;
    const worldRight = (stageSize.width - viewport.x) / viewport.scale;
    const worldTop = (-viewport.y) / viewport.scale;
    const worldBottom = (stageSize.height - viewport.y) / viewport.scale;
    const spacingOnScreen = GRID_MAJOR_SPACING * viewport.scale;
    const labelStride = Math.max(
      1,
      Math.ceil(56 / Math.max(18, spacingOnScreen)),
    );

    const xLabels: Array<{ screen: number; value: number }> = [];
    const yLabels: Array<{ screen: number; value: number }> = [];
    const startX =
      Math.floor(worldLeft / GRID_MAJOR_SPACING) * GRID_MAJOR_SPACING;
    const startY =
      Math.floor(worldTop / GRID_MAJOR_SPACING) * GRID_MAJOR_SPACING;

    for (
      let index = 0, worldX = startX;
      worldX <= worldRight && index < 800;
      index += 1, worldX += GRID_MAJOR_SPACING
    ) {
      const majorIndex = Math.round(worldX / GRID_MAJOR_SPACING);
      if (majorIndex % labelStride !== 0) {
        continue;
      }

      const screenX = viewport.x + worldX * viewport.scale;
      xLabels.push({
        screen: screenX,
        value: Math.round(worldX),
      });
    }

    for (
      let index = 0, worldY = startY;
      worldY <= worldBottom && index < 800;
      index += 1, worldY += GRID_MAJOR_SPACING
    ) {
      const majorIndex = Math.round(worldY / GRID_MAJOR_SPACING);
      if (majorIndex % labelStride !== 0) {
        continue;
      }

      const screenY = viewport.y + worldY * viewport.scale;
      yLabels.push({
        screen: screenY,
        value: Math.round(worldY),
      });
    }

    return {
      xLabels,
      yLabels,
    };
  }, [stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y]);

  return (
    <section
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `${isLeftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH}px ${PANEL_SEPARATOR_WIDTH}px minmax(0, 1fr) ${PANEL_SEPARATOR_WIDTH}px ${isRightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH}px`,
          transition: `grid-template-columns ${PANEL_COLLAPSE_ANIMATION}`,
        }}
      >
        <aside
          style={{
            minWidth: 0,
            minHeight: 0,
            background: "var(--surface-muted)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {isLeftPanelCollapsed ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                type="button"
                onClick={() => setIsLeftPanelCollapsed(false)}
                title="Expand tools panel"
                aria-label="Expand tools panel"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderRight: "1px solid var(--border-strong)",
                  borderRadius: 0,
                  background: "var(--surface-subtle)",
                  color: "var(--text)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: 0.3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  {">"}
                </span>
                <span
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  Tools
                </span>
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: 0,
                  borderBottom: "1px solid var(--border)",
                  display: "grid",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsLeftPanelCollapsed(true)}
                  title="Collapse tools panel"
                  aria-label="Collapse tools panel"
                  style={{
                    width: "100%",
                    height: 30,
                    border: "none",
                    borderRadius: 0,
                    borderBottom: "1px solid var(--border-strong)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 0.3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.45rem",
                    cursor: "pointer",
                    transition:
                      "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    {"<"}
                  </span>
                  <span>Tools</span>
                </button>
              </div>

              <div
                style={{
                  minHeight: 0,
                  overflowY: "auto",
                  overflowX: "hidden",
                  padding: "0.65rem",
                  display: "grid",
                  gap: "0.7rem",
                  alignContent: "start",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 42px)",
                    justifyContent: "center",
                    gap: "0.45rem",
                    overflow: "visible",
                  }}
                >
                  {BOARD_TOOLS.map((toolKind) => (
                    <button
                      key={toolKind}
                      type="button"
                      onClick={() => handleToolButtonClick(toolKind)}
                      disabled={!canEdit}
                      title={`Add ${getObjectLabel(toolKind).toLowerCase()}`}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 42,
                        minWidth: 42,
                        maxWidth: 42,
                        minHeight: 42,
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        background: "var(--surface)",
                        height: 42,
                        padding: 0,
                        lineHeight: 0,
                        overflow: "visible",
                      }}
                    >
                      <ToolIcon kind={toolKind} />
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleCreateSwotButtonClick}
                  disabled={!canEdit || isAiSubmitting || isSwotTemplateCreating}
                  title="Create SWOT analysis"
                  style={{
                    width: "100%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.45rem",
                    border: "1px solid #c7d2fe",
                    borderRadius: 8,
                    background:
                      !canEdit || isAiSubmitting || isSwotTemplateCreating
                        ? "#eef2ff"
                        : "#e0e7ff",
                    color: "#312e81",
                    height: 34,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor:
                      !canEdit || isAiSubmitting || isSwotTemplateCreating
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  <BriefcaseIcon />
                  <span>SWOT</span>
                </button>

                {hasDeletableSelection ? (
                  <button
                    type="button"
                    onClick={handleDeleteButtonClick}
                    title="Delete selected objects"
                    style={{
                      width: "100%",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.4rem",
                    border: "1px solid #fecaca",
                    borderRadius: 8,
                    background: "rgba(239, 68, 68, 0.14)",
                    color: "#991b1b",
                    height: 34,
                    fontSize: 12,
                    }}
                  >
                    <TrashIcon />
                    <span>Delete ({selectedObjectCount})</span>
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => setViewport(INITIAL_VIEWPORT)}
                  style={{
                    width: "100%",
                    height: 32,
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    fontSize: 12,
                  }}
                >
                  Reset view
                </button>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "22px minmax(0, 1fr) 22px auto",
                    alignItems: "center",
                    gap: "0.35rem",
                    width: "100%",
                    padding: "0.2rem 0.35rem",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--surface)",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => nudgeZoom("out")}
                    title="Zoom out"
                    aria-label="Zoom out"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface-muted)",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    −
                  </button>
                  <input
                    type="range"
                    min={ZOOM_SLIDER_MIN_PERCENT}
                    max={ZOOM_SLIDER_MAX_PERCENT}
                    step={1}
                    value={zoomSliderValue}
                    onChange={(event) => {
                      const nextScale = Number(event.target.value) / 100;
                      zoomAtStageCenter(nextScale);
                    }}
                    aria-label="Zoom level"
                    style={{
                      width: "100%",
                      minWidth: 0,
                      accentColor: "#2563eb",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => nudgeZoom("in")}
                    title="Zoom in"
                    aria-label="Zoom in"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      border: "1px solid var(--border)",
                      background: "var(--surface-muted)",
                      lineHeight: 1,
                      padding: 0,
                    }}
                  >
                    +
                  </button>
                  <span
                    style={{
                      color: "var(--text-muted)",
                      fontSize: 11,
                      minWidth: 34,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {zoomPercent}%
                  </span>
                </div>

                <label
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    width: "100%",
                    padding: "0.45rem 0.55rem",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    background: "var(--surface)",
                    color: "var(--text-muted)",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSnapToGridEnabled}
                    onChange={(event) =>
                      setIsSnapToGridEnabled(event.target.checked)
                    }
                    style={{
                      width: 14,
                      height: 14,
                      accentColor: "#2563eb",
                      cursor: "pointer",
                    }}
                  />
                  <span>Snap to grid</span>
                </label>

                <span
                  style={{
                    color:
                      selectedObjectCount > 0
                        ? "var(--text)"
                        : "var(--text-muted)",
                    fontSize: 12,
                    lineHeight: 1.25,
                    wordBreak: "break-word",
                  }}
                >
                  Selected:{" "}
                  {selectedObjectCount > 0
                    ? `${selectedObjectCount} object${selectedObjectCount === 1 ? "" : "s"}`
                    : "None"}
                </span>

                <span
                  style={{
                    color: cursorBoardPosition
                      ? "var(--text)"
                      : "var(--text-muted)",
                    fontSize: 12,
                    lineHeight: 1.25,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  Cursor:{" "}
                  {cursorBoardPosition
                    ? `${cursorBoardPosition.x}, ${cursorBoardPosition.y}`
                    : "—"}
                </span>

                {boardError ? (
                  <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>
                    {boardError}
                  </p>
                ) : null}
              </div>
            </>
          )}
        </aside>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <div
            ref={stageRef}
            onPointerDown={handleStagePointerDown}
            onPointerMove={handleStagePointerMove}
            onPointerLeave={handleStagePointerLeave}
            onContextMenu={(event) => event.preventDefault()}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              minHeight: 0,
              overflow: "hidden",
              backgroundColor: "var(--canvas-bg)",
              backgroundImage:
                `linear-gradient(${BOARD_GRID_SUPER_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_SUPER_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(${BOARD_GRID_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_MAJOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(${BOARD_GRID_MINOR_LINE_COLOR} 1px, transparent 1px), linear-gradient(90deg, ${BOARD_GRID_MINOR_LINE_COLOR} 1px, transparent 1px)`,
              backgroundSize: `${GRID_SUPER_MAJOR_SPACING * viewport.scale}px ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px, ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px ${GRID_SUPER_MAJOR_SPACING * viewport.scale}px, ${GRID_MAJOR_SPACING * viewport.scale}px ${GRID_MAJOR_SPACING * viewport.scale}px, ${GRID_MAJOR_SPACING * viewport.scale}px ${GRID_MAJOR_SPACING * viewport.scale}px, ${GRID_CELL_SIZE * viewport.scale}px ${GRID_CELL_SIZE * viewport.scale}px, ${GRID_CELL_SIZE * viewport.scale}px ${GRID_CELL_SIZE * viewport.scale}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px, ${viewport.x}px ${viewport.y}px`,
              touchAction: "none",
              overscrollBehavior: "contain",
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                zIndex: 5,
                overflow: "hidden",
              }}
            >
              {gridAxisLabels.xLabels.map((label) => (
                <span
                  key={`x-${label.value}`}
                  style={{
                    position: "absolute",
                    left: Math.round(label.screen) + 3,
                    top: 4,
                    padding: "0 3px",
                    borderRadius: 4,
                    background: "var(--canvas-axis-label-bg)",
                    color: "var(--canvas-axis-label-text)",
                    fontSize: 10,
                    lineHeight: 1.35,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label.value}
                </span>
              ))}
              {viewport.x >= -1 && viewport.x <= stageSize.width + 1 ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: Math.round(viewport.x),
                    top: 0,
                    bottom: 0,
                    width: 1,
                    background: "rgba(244, 114, 182, 0.55)",
                  }}
                />
              ) : null}
              {viewport.y >= -1 && viewport.y <= stageSize.height + 1 ? (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: Math.round(viewport.y),
                    height: 1,
                    background: "rgba(244, 114, 182, 0.55)",
                  }}
                />
              ) : null}
              {gridAxisLabels.yLabels.map((label) => (
                <span
                  key={`y-${label.value}`}
                  style={{
                    position: "absolute",
                    left: 4,
                    top: Math.round(label.screen) + 3,
                    padding: "0 3px",
                    borderRadius: 4,
                    background: "var(--canvas-axis-label-bg)",
                    color: "var(--canvas-axis-label-text)",
                    fontSize: 10,
                    lineHeight: 1.35,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    whiteSpace: "nowrap",
                  }}
                >
                  {label.value}
                </span>
              ))}
            </div>

            {canShowSelectionHud && selectionHudPosition ? (
              <div
                ref={selectionHudRef}
                data-selection-hud="true"
                onPointerDown={(event) => {
                  event.stopPropagation();
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                style={{
                  position: "absolute",
                  left: selectionHudPosition.x,
                  top: selectionHudPosition.y,
                  zIndex: 45,
                  display: "grid",
                  gap: "0.45rem",
                  padding: "0.4rem 0.45rem",
                  borderRadius: 10,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
                  backdropFilter: "blur(2px)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    flexWrap: "wrap",
                  }}
                >
                  {canColorSelection ? (
                    <ColorSwatchPicker
                      currentColor={selectedColor}
                      onSelectColor={(nextColor) => {
                        void saveSelectedObjectsColor(nextColor);
                      }}
                    />
                  ) : null}
                  {canResetSelectionRotation ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void resetSelectedObjectsRotation();
                      }}
                      className="h-8 rounded-md text-xs"
                      style={{
                        background: "var(--surface)",
                        color: "var(--text)",
                        borderColor: "var(--border)",
                      }}
                    >
                      Reset rotation
                    </Button>
                  ) : null}
                </div>
                {canEditSelectedLabel && singleSelectedObject ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "0.32rem",
                      minWidth: 280,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "var(--text-muted)",
                        letterSpacing: "0.01em",
                      }}
                    >
                      Label
                    </span>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <Input
                        value={selectionLabelDraft}
                        onChange={(event) => {
                          setSelectionLabelDraft(
                            event.target.value.slice(0, OBJECT_LABEL_MAX_LENGTH),
                          );
                        }}
                        onBlur={() => {
                          void commitSelectionLabelDraft();
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitSelectionLabelDraft();
                            (event.currentTarget as HTMLInputElement).blur();
                          }

                          if (event.key === "Escape") {
                            event.preventDefault();
                            setSelectionLabelDraft(singleSelectedObject.text ?? "");
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        placeholder="Add label"
                        aria-label={`Label for ${getObjectLabel(singleSelectedObject.type)}`}
                        style={{
                          height: 32,
                          border: "1px solid var(--input-border)",
                          background: "var(--input-bg)",
                          color: "var(--text)",
                        }}
                      />
                      <IconButton
                        label="Clear label"
                        size="sm"
                        onClick={() => {
                          setSelectionLabelDraft("");
                          void persistObjectLabelText(singleSelectedObject.id, "");
                        }}
                        disabled={(singleSelectedObject.text ?? "").length === 0}
                        style={{
                          border: "1px solid var(--border)",
                          background: "var(--surface)",
                          color: "var(--text-muted)",
                        }}
                      >
                        <ClearTextIcon />
                      </IconButton>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            <div
              style={{
                position: "absolute",
                inset: 0,
                transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
                transformOrigin: "0 0",
              }}
            >
              {objects.map((objectItem) => {
                const draftGeometry = draftGeometryById[objectItem.id];
                const hasDraftGeometry = Boolean(draftGeometry);
                const objectX = draftGeometry?.x ?? objectItem.x;
                const objectY = draftGeometry?.y ?? objectItem.y;
                const objectWidth = draftGeometry?.width ?? objectItem.width;
                const objectHeight = draftGeometry?.height ?? objectItem.height;
                const objectRotationDeg =
                  draftGeometry?.rotationDeg ?? objectItem.rotationDeg;
                const objectText = textDrafts[objectItem.id] ?? objectItem.text;
                const objectLabelText =
                  objectItem.type === "sticky" || objectItem.type === "gridContainer"
                    ? ""
                    : (objectItem.text ?? "").trim();
                const isSelected = selectedObjectIds.includes(objectItem.id);
                const isSingleSelected =
                  selectedObjectIds.length === 1 && isSelected;
                const isConnector = isConnectorKind(objectItem.type);
                const renderedObjectColor = getRenderedObjectColor(
                  objectItem.color,
                  objectItem.type,
                  resolvedTheme,
                );
                const objectSurfaceColor =
                  resolvedTheme === "dark" ? "rgba(241, 245, 249, 0.58)" : "rgba(15, 23, 42, 0.55)";
                const objectTextColor = getReadableTextColor(renderedObjectColor);
                const objectGeometry: ObjectGeometry = {
                  x: objectX,
                  y: objectY,
                  width: objectWidth,
                  height: objectHeight,
                  rotationDeg: objectRotationDeg,
                };
                const connectorRoute = isConnector
                  ? (connectorRoutesById.get(objectItem.id) ?? null)
                  : null;
                const connectorFrame = connectorRoute
                  ? {
                      left: connectorRoute.geometry.bounds.left,
                      top: connectorRoute.geometry.bounds.top,
                      width: Math.max(
                        1,
                        connectorRoute.geometry.bounds.right -
                          connectorRoute.geometry.bounds.left,
                      ),
                      height: Math.max(
                        1,
                        connectorRoute.geometry.bounds.bottom -
                          connectorRoute.geometry.bounds.top,
                      ),
                    }
                  : null;
                const lineEndpointOffsets =
                  objectItem.type === "line"
                    ? getLineEndpointOffsets(objectGeometry)
                    : null;
                const isPolygonShape =
                  objectItem.type === "triangle" || objectItem.type === "star";
                const isGridContainer = objectItem.type === "gridContainer";
                const gridRows = isGridContainer
                  ? Math.max(1, objectItem.gridRows ?? 2)
                  : 0;
                const gridCols = isGridContainer
                  ? Math.max(1, objectItem.gridCols ?? 2)
                  : 0;
                const gridGap = isGridContainer
                  ? Math.max(
                      0,
                      objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP,
                    )
                  : 0;
                const gridTotalCells = isGridContainer
                  ? gridRows * gridCols
                  : 0;
                const gridCellColors =
                  isGridContainer &&
                  objectItem.gridCellColors &&
                  objectItem.gridCellColors.length > 0
                    ? objectItem.gridCellColors
                    : SWOT_SECTION_COLORS;
                const gridFallbackTitles = isGridContainer
                  ? getDefaultSectionTitles(gridRows, gridCols)
                  : [];
                const gridDraft = isGridContainer
                  ? getGridDraftForObject(objectItem)
                  : null;
                const gridContainerTitle =
                  gridDraft?.containerTitle ?? objectItem.containerTitle ?? "";
                const gridSectionTitles =
                  gridDraft?.sectionTitles ??
                  normalizeSectionValues(
                    objectItem.gridSectionTitles,
                    gridTotalCells,
                    (index) =>
                      gridFallbackTitles[index] ?? `Section ${index + 1}`,
                    80,
                  );

                if (isConnector && connectorRoute && connectorFrame) {
                  const strokeWidth = 3;
                  const resolvedConnector = connectorRoute.resolved;
                  const relativeRoutePoints =
                    connectorRoute.geometry.points.map((point) => ({
                      x: point.x - connectorFrame.left,
                      y: point.y - connectorFrame.top,
                    }));
                  const connectorPath = toRoundedConnectorPath(
                    relativeRoutePoints,
                    16,
                  );
                  const fromOffset = relativeRoutePoints[0] ?? {
                    x: resolvedConnector.from.x - connectorFrame.left,
                    y: resolvedConnector.from.y - connectorFrame.top,
                  };
                  const toOffset = relativeRoutePoints[
                    relativeRoutePoints.length - 1
                  ] ?? {
                    x: resolvedConnector.to.x - connectorFrame.left,
                    y: resolvedConnector.to.y - connectorFrame.top,
                  };
                  const startDirection = connectorRoute.geometry.startDirection;
                  const endDirection = connectorRoute.geometry.endDirection;
                  const isEndpointDragActive =
                    connectorEndpointDragStateRef.current?.objectId ===
                    objectItem.id;

                  /**
                   * Builds arrow head points.
                   */
                  const buildArrowHeadPoints = (
                    tip: BoardPoint,
                    direction: BoardPoint,
                  ): string => {
                    const directionMagnitude = Math.hypot(
                      direction.x,
                      direction.y,
                    );
                    const normalizedDirection =
                      directionMagnitude > 0.0001
                        ? {
                            x: direction.x / directionMagnitude,
                            y: direction.y / directionMagnitude,
                          }
                        : { x: 1, y: 0 };
                    const perpendicular = {
                      x: -normalizedDirection.y,
                      y: normalizedDirection.x,
                    };
                    const arrowLength = 12;
                    const arrowWidth = 6;
                    const backPoint = {
                      x: tip.x - normalizedDirection.x * arrowLength,
                      y: tip.y - normalizedDirection.y * arrowLength,
                    };
                    const leftPoint = {
                      x: backPoint.x + perpendicular.x * arrowWidth,
                      y: backPoint.y + perpendicular.y * arrowWidth,
                    };
                    const rightPoint = {
                      x: backPoint.x - perpendicular.x * arrowWidth,
                      y: backPoint.y - perpendicular.y * arrowWidth,
                    };
                    return `${tip.x},${tip.y} ${leftPoint.x},${leftPoint.y} ${rightPoint.x},${rightPoint.y}`;
                  };

                  const showFromArrow =
                    objectItem.type === "connectorBidirectional";
                  const showToArrow =
                    objectItem.type === "connectorArrow" ||
                    objectItem.type === "connectorBidirectional";

                  return (
                    <article
                      key={objectItem.id}
                      data-board-object="true"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (event.shiftKey) {
                          toggleObjectSelection(objectItem.id);
                          return;
                        }

                        selectSingleObject(objectItem.id);
                      }}
                      style={{
                        position: "absolute",
                        left: connectorFrame.left,
                        top: connectorFrame.top,
                        width: connectorFrame.width,
                        height: connectorFrame.height,
                        overflow: "visible",
                        boxShadow: "none",
                        transition: isEndpointDragActive
                          ? "none"
                          : "left 95ms cubic-bezier(0.22, 1, 0.36, 1), top 95ms cubic-bezier(0.22, 1, 0.36, 1), width 95ms cubic-bezier(0.22, 1, 0.36, 1), height 95ms cubic-bezier(0.22, 1, 0.36, 1)",
                      }}
                    >
                      <svg
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (event.shiftKey) {
                            toggleObjectSelection(objectItem.id);
                            return;
                          }

                          selectSingleObject(objectItem.id);
                        }}
                        viewBox={`0 0 ${connectorFrame.width} ${connectorFrame.height}`}
                        width={connectorFrame.width}
                        height={connectorFrame.height}
                        style={{
                          display: "block",
                          overflow: "visible",
                          cursor: canEdit ? "pointer" : "default",
                          filter: isSelected
                            ? "drop-shadow(0 0 5px rgba(37, 99, 235, 0.45))"
                            : "none",
                        }}
                      >
                        <path
                          d={connectorPath}
                          stroke={renderedObjectColor}
                          strokeWidth={strokeWidth}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                          style={{
                            transition: isEndpointDragActive
                              ? "none"
                              : "d 95ms cubic-bezier(0.22, 1, 0.36, 1)",
                          }}
                        />
                        {showFromArrow ? (
                          <polygon
                            points={buildArrowHeadPoints(fromOffset, {
                              x: -startDirection.x,
                              y: -startDirection.y,
                            })}
                            fill={renderedObjectColor}
                          />
                        ) : null}
                        {showToArrow ? (
                          <polygon
                            points={buildArrowHeadPoints(
                              toOffset,
                              endDirection,
                            )}
                            fill={renderedObjectColor}
                          />
                        ) : null}
                      </svg>
                      {objectLabelText.length > 0 ? (
                        <div
                          style={{
                            position: "absolute",
                            left:
                              connectorRoute.geometry.midPoint.x -
                              connectorFrame.left,
                            top:
                              connectorRoute.geometry.midPoint.y -
                              connectorFrame.top,
                            transform: "translate(-50%, -50%)",
                            borderRadius: 8,
                            border: "1px solid var(--border)",
                            background: "var(--surface)",
                            color: "var(--text)",
                            fontSize: 12,
                            fontWeight: 600,
                            lineHeight: 1.25,
                            padding: "0.2rem 0.45rem",
                            boxShadow: "0 2px 8px rgba(2,6,23,0.2)",
                            maxWidth: 180,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            pointerEvents: "none",
                          }}
                          title={objectLabelText}
                        >
                          {objectLabelText}
                        </div>
                      ) : null}

                      {isSingleSelected && canEdit ? (
                        <>
                          <button
                            type="button"
                            onPointerDown={(event) =>
                              startConnectorEndpointDrag(
                                objectItem.id,
                                "from",
                                event,
                              )
                            }
                            aria-label="Adjust connector start"
                            style={{
                              position: "absolute",
                              left:
                                fromOffset.x -
                                (resolvedConnector.from.connected
                                  ? CONNECTOR_HANDLE_SIZE
                                  : CONNECTOR_DISCONNECTED_HANDLE_SIZE) /
                                  2,
                              top:
                                fromOffset.y -
                                (resolvedConnector.from.connected
                                  ? CONNECTOR_HANDLE_SIZE
                                  : CONNECTOR_DISCONNECTED_HANDLE_SIZE) /
                                  2,
                              width: resolvedConnector.from.connected
                                ? CONNECTOR_HANDLE_SIZE
                                : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
                              height: resolvedConnector.from.connected
                                ? CONNECTOR_HANDLE_SIZE
                                : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
                              borderRadius: "50%",
                              border: resolvedConnector.from.connected
                                ? "1.5px solid #1d4ed8"
                                : "2px solid #b45309",
                              background: resolvedConnector.from.connected
                                ? "#dbeafe"
                                : "#fff7ed",
                              boxShadow: resolvedConnector.from.connected
                                ? "0 0 0 2px rgba(59, 130, 246, 0.2)"
                                : "0 0 0 3px rgba(245, 158, 11, 0.28)",
                              cursor: "move",
                            }}
                          />
                          <button
                            type="button"
                            onPointerDown={(event) =>
                              startConnectorEndpointDrag(
                                objectItem.id,
                                "to",
                                event,
                              )
                            }
                            aria-label="Adjust connector end"
                            style={{
                              position: "absolute",
                              left:
                                toOffset.x -
                                (resolvedConnector.to.connected
                                  ? CONNECTOR_HANDLE_SIZE
                                  : CONNECTOR_DISCONNECTED_HANDLE_SIZE) /
                                  2,
                              top:
                                toOffset.y -
                                (resolvedConnector.to.connected
                                  ? CONNECTOR_HANDLE_SIZE
                                  : CONNECTOR_DISCONNECTED_HANDLE_SIZE) /
                                  2,
                              width: resolvedConnector.to.connected
                                ? CONNECTOR_HANDLE_SIZE
                                : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
                              height: resolvedConnector.to.connected
                                ? CONNECTOR_HANDLE_SIZE
                                : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
                              borderRadius: "50%",
                              border: resolvedConnector.to.connected
                                ? "1.5px solid #1d4ed8"
                                : "2px solid #b45309",
                              background: resolvedConnector.to.connected
                                ? "#dbeafe"
                                : "#fff7ed",
                              boxShadow: resolvedConnector.to.connected
                                ? "0 0 0 2px rgba(59, 130, 246, 0.2)"
                                : "0 0 0 3px rgba(245, 158, 11, 0.28)",
                              cursor: "move",
                            }}
                          />
                        </>
                      ) : (
                        <>
                          {!resolvedConnector.from.connected ? (
                            <span
                              style={{
                                position: "absolute",
                                left: fromOffset.x - 6,
                                top: fromOffset.y - 6,
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                border: "2px solid #b45309",
                                background: "#fff7ed",
                                boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.2)",
                                pointerEvents: "none",
                              }}
                            />
                          ) : null}
                          {!resolvedConnector.to.connected ? (
                            <span
                              style={{
                                position: "absolute",
                                left: toOffset.x - 6,
                                top: toOffset.y - 6,
                                width: 12,
                                height: 12,
                                borderRadius: "50%",
                                border: "2px solid #b45309",
                                background: "#fff7ed",
                                boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.2)",
                                pointerEvents: "none",
                              }}
                            />
                          ) : null}
                        </>
                      )}
                    </article>
                  );
                }

                if (objectItem.type === "sticky") {
                  return (
                    <article
                      key={objectItem.id}
                      data-board-object="true"
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        if (event.shiftKey) {
                          toggleObjectSelection(objectItem.id);
                          return;
                        }

                        selectSingleObject(objectItem.id);
                      }}
                      style={{
                        position: "absolute",
                        left: objectX,
                        top: objectY,
                        width: objectWidth,
                        height: objectHeight,
                        zIndex: 0,
                        isolation: "isolate",
                        borderRadius: 10,
                        border: isSelected
                          ? "2px solid #2563eb"
                          : resolvedTheme === "dark"
                            ? "1px solid rgba(148, 163, 184, 0.45)"
                            : "1px solid rgba(15, 23, 42, 0.28)",
                        background: renderedObjectColor,
                        boxShadow: isSelected
                          ? SELECTED_OBJECT_HALO
                          : "0 4px 12px rgba(0,0,0,0.08)",
                        overflow: "visible",
                        transform: `rotate(${objectRotationDeg}deg)`,
                        transformOrigin: "center center",
                        transition: hasDraftGeometry
                          ? "none"
                          : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear",
                      }}
                    >
                      <div
                        style={{
                          width: "100%",
                          height: "100%",
                          borderRadius: 8,
                          overflow: "hidden",
                        }}
                      >
                        <header
                          onPointerDown={(event) =>
                            startObjectDrag(objectItem.id, event)
                          }
                          style={{
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "flex-start",
                            gap: "0.35rem",
                            padding: "0 0.5rem",
                            background: "rgba(0,0,0,0.08)",
                            cursor: canEdit
                              ? isObjectDragging
                                ? "grabbing"
                                : "grab"
                              : "default",
                          }}
                        />

                        <textarea
                          value={objectText}
                          onPointerDown={(event) => {
                            event.stopPropagation();
                            if (event.shiftKey) {
                              toggleObjectSelection(objectItem.id);
                              clearStickyTextHoldDrag();
                              return;
                            }

                            selectSingleObject(objectItem.id);

                            if (!canEdit || event.button !== 0) {
                              clearStickyTextHoldDrag();
                              return;
                            }

                            clearStickyTextHoldDrag();
                            const timerId = window.setTimeout(() => {
                              const holdState = stickyTextHoldDragRef.current;
                              if (
                                !holdState ||
                                holdState.objectId !== objectItem.id ||
                                holdState.started
                              ) {
                                return;
                              }

                              stickyTextHoldDragRef.current = {
                                ...holdState,
                                started: true,
                                timerId: null,
                              };
                              startObjectDrag(
                                objectItem.id,
                                {
                                  button: 0,
                                  shiftKey: false,
                                  clientX: holdState.startClientX,
                                  clientY: holdState.startClientY,
                                  preventDefault: () => {},
                                  stopPropagation: () => {},
                                } as unknown as ReactPointerEvent<HTMLElement>,
                              );
                            }, STICKY_TEXT_HOLD_DRAG_DELAY_MS);

                            stickyTextHoldDragRef.current = {
                              objectId: objectItem.id,
                              startClientX: event.clientX,
                              startClientY: event.clientY,
                              timerId,
                              started: false,
                            };
                          }}
                          onPointerMove={(event) => {
                            const holdState = stickyTextHoldDragRef.current;
                            if (
                              !holdState ||
                              holdState.objectId !== objectItem.id ||
                              holdState.started
                            ) {
                              return;
                            }

                            if (!canEdit) {
                              clearStickyTextHoldDrag();
                              return;
                            }

                            const distance = Math.hypot(
                              event.clientX - holdState.startClientX,
                              event.clientY - holdState.startClientY,
                            );
                            if (distance < DRAG_CLICK_SLOP_PX) {
                              return;
                            }

                            if (holdState.timerId !== null) {
                              window.clearTimeout(holdState.timerId);
                            }

                            stickyTextHoldDragRef.current = {
                              ...holdState,
                              started: true,
                              timerId: null,
                            };
                            event.preventDefault();
                            startObjectDrag(
                              objectItem.id,
                              {
                                button: 0,
                                shiftKey: false,
                                clientX: event.clientX,
                                clientY: event.clientY,
                                preventDefault: () => {},
                                stopPropagation: () => {},
                              } as unknown as ReactPointerEvent<HTMLElement>,
                            );
                          }}
                          onPointerUp={() => {
                            clearStickyTextHoldDrag();
                          }}
                          onPointerCancel={() => {
                            clearStickyTextHoldDrag();
                          }}
                          onFocus={() => selectSingleObject(objectItem.id)}
                          onChange={(event) => {
                            const nextText = event.target.value.slice(0, 1_000);
                            setTextDrafts((previous) => ({
                              ...previous,
                              [objectItem.id]: nextText,
                            }));
                            queueStickyTextSync(objectItem.id, nextText);
                          }}
                          onBlur={(event) => {
                            clearStickyTextHoldDrag();
                            const nextText = event.target.value;
                            setTextDrafts((previous) => {
                              const next = { ...previous };
                              delete next[objectItem.id];
                              return next;
                            });

                            queueStickyTextSync(objectItem.id, nextText);
                            flushStickyTextSync(objectItem.id);
                          }}
                          readOnly={!canEdit}
                          style={{
                            width: "100%",
                            height: objectHeight - 28,
                            border: "none",
                            resize: "none",
                            padding: "0.5rem",
                            background: "transparent",
                            color: objectTextColor,
                            fontSize: 14,
                            outline: "none",
                            cursor: canEdit
                              ? isObjectDragging
                                ? "grabbing"
                                : "grab"
                              : "default",
                          }}
                        />
                      </div>

                      {isSingleSelected && canEdit ? (
                        <div>
                          {CORNER_HANDLES.map((corner) => (
                            <button
                              key={corner}
                              type="button"
                              onPointerDown={(event) =>
                                startCornerResize(objectItem.id, corner, event)
                              }
                              style={{
                                position: "absolute",
                                ...getCornerPositionStyle(corner),
                                width: RESIZE_HANDLE_SIZE,
                                height: RESIZE_HANDLE_SIZE,
                                border: "1px solid #1d4ed8",
                                borderRadius: 2,
                                background: "var(--surface)",
                                cursor: getCornerCursor(corner),
                              }}
                              aria-label={`Resize ${corner} corner`}
                            />
                          ))}
                        </div>
                      ) : null}

                      {isSingleSelected && canEdit ? (
                        <>
                          <div
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              width: 2,
                              height: 16,
                              background: "#93c5fd",
                              transform: "translate(-50%, -102%)",
                              pointerEvents: "none",
                            }}
                          />
                          <button
                            type="button"
                            onPointerDown={(event) =>
                              startShapeRotate(objectItem.id, event)
                            }
                            aria-label="Rotate note"
                            title="Drag to rotate note (hold Shift to snap)"
                            style={{
                              position: "absolute",
                              left: "50%",
                              top: 0,
                              transform: "translate(-50%, -168%)",
                              width: 14,
                              height: 14,
                              borderRadius: "50%",
                              border: "1px solid #1d4ed8",
                              background: "var(--surface)",
                              boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
                              cursor: "grab",
                            }}
                          />
                        </>
                      ) : null}
                    </article>
                  );
                }

                return (
                  <article
                    key={objectItem.id}
                    data-board-object="true"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      if (event.shiftKey) {
                        toggleObjectSelection(objectItem.id);
                        return;
                      }

                      selectSingleObject(objectItem.id);
                    }}
                    style={{
                      position: "absolute",
                      left: objectX,
                      top: objectY,
                      width: objectWidth,
                      height: objectHeight,
                      zIndex: 0,
                      isolation: "isolate",
                      overflow: "visible",
                      boxShadow: isSelected
                        ? objectItem.type === "line"
                          ? "none"
                          : SELECTED_OBJECT_HALO
                        : "none",
                      borderRadius:
                        objectItem.type === "circle"
                          ? "999px"
                          : objectItem.type === "line" ||
                              objectItem.type === "gridContainer" ||
                              objectItem.type === "triangle" ||
                              objectItem.type === "star"
                            ? 0
                            : 4,
                      transform:
                        objectItem.type === "line" ||
                        objectItem.type === "gridContainer"
                          ? "none"
                          : `rotate(${objectRotationDeg}deg)`,
                      transformOrigin: "center center",
                      transition: hasDraftGeometry
                        ? "none"
                        : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear",
                    }}
                  >
                    <div
                      onPointerDown={(event) =>
                        startObjectDrag(objectItem.id, event)
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: canEdit
                          ? isObjectDragging
                            ? "grabbing"
                            : "grab"
                          : "default",
                        border:
                          objectItem.type === "line" ||
                          isPolygonShape ||
                          isGridContainer
                            ? "none"
                            : `2px solid ${objectSurfaceColor}`,
                        borderRadius:
                          objectItem.type === "rect"
                            ? 3
                            : objectItem.type === "circle"
                              ? "999px"
                              : 0,
                        background:
                          objectItem.type === "line" ||
                          isPolygonShape ||
                          isGridContainer
                            ? "transparent"
                            : renderedObjectColor,
                        boxShadow:
                          objectItem.type === "line" ||
                          isPolygonShape ||
                          isGridContainer
                            ? "none"
                            : "0 3px 10px rgba(0,0,0,0.08)",
                      }}
                    >
                      {objectItem.type === "line" ? (
                        <div
                          style={{
                            width: "100%",
                            height: 4,
                            borderRadius: 999,
                            background: renderedObjectColor,
                            transform: `rotate(${objectRotationDeg}deg)`,
                            transformOrigin: "center center",
                          }}
                        />
                      ) : objectItem.type === "triangle" ? (
                        <svg
                          viewBox="0 0 100 100"
                          width="100%"
                          height="100%"
                          aria-hidden="true"
                          style={{ display: "block" }}
                        >
                          <polygon
                            points="50,6 94,92 6,92"
                            fill={renderedObjectColor}
                            stroke={
                              resolvedTheme === "dark"
                                ? "rgba(241, 245, 249, 0.72)"
                                : "rgba(15, 23, 42, 0.62)"
                            }
                            strokeWidth="5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : objectItem.type === "star" ? (
                        <svg
                          viewBox="0 0 100 100"
                          width="100%"
                          height="100%"
                          aria-hidden="true"
                          style={{ display: "block" }}
                        >
                          <polygon
                            points="50,7 61,38 95,38 67,57 78,90 50,70 22,90 33,57 5,38 39,38"
                            fill={renderedObjectColor}
                            stroke={
                              resolvedTheme === "dark"
                                ? "rgba(241, 245, 249, 0.72)"
                                : "rgba(15, 23, 42, 0.62)"
                            }
                            strokeWidth="5"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : objectItem.type === "gridContainer" ? (
                        <GridContainer
                          rows={gridRows}
                          cols={gridCols}
                          gap={gridGap}
                          minCellHeight={0}
                          className="h-full w-full rounded-[10px] border-2 p-2 shadow-none"
                          cellClassName="rounded-lg border-2 p-2"
                          containerColor={renderedObjectColor}
                          containerTitle={gridContainerTitle}
                          cellColors={Array.from(
                            { length: gridTotalCells },
                            (_, index) => {
                              const baseColor =
                                gridCellColors[index % gridCellColors.length] ??
                                "#e2e8f0";
                              return getRenderedObjectColor(
                                baseColor,
                                "sticky",
                                resolvedTheme,
                              );
                            },
                          )}
                          sectionTitles={gridSectionTitles}
                          chromeTone={resolvedTheme}
                          sectionTitleTextColor={
                            resolvedTheme === "dark"
                              ? "rgba(241, 245, 249, 0.95)"
                              : "#1f2937"
                          }
                          sectionBodyTextColor={
                            resolvedTheme === "dark"
                              ? "rgba(226, 232, 240, 0.95)"
                              : "#334155"
                          }
                          containerTitleTextColor={
                            resolvedTheme === "dark"
                              ? "rgba(248, 250, 252, 0.98)"
                              : "#0f172a"
                          }
                          showGridControls={isSingleSelected && canEdit}
                          minRows={1}
                          maxRows={GRID_CONTAINER_MAX_ROWS}
                          minCols={1}
                          maxCols={GRID_CONTAINER_MAX_COLS}
                          onGridDimensionsChange={
                            canEdit
                              ? (nextRows, nextCols) => {
                                  void updateGridContainerDimensions(
                                    objectItem.id,
                                    nextRows,
                                    nextCols,
                                  );
                                }
                              : undefined
                          }
                          onContainerTitleChange={
                            canEdit
                              ? (nextTitle) => {
                                  const currentDraft =
                                    getGridDraftForObject(objectItem);
                                  queueGridContentSync(
                                    objectItem.id,
                                    {
                                      ...currentDraft,
                                      containerTitle: nextTitle.slice(0, 120),
                                    },
                                    { immediate: true },
                                  );
                                }
                              : undefined
                          }
                          onSectionTitleChange={
                            canEdit
                              ? (sectionIndex, nextTitle) => {
                                  const currentDraft =
                                    getGridDraftForObject(objectItem);
                                  const nextTitles = [
                                    ...currentDraft.sectionTitles,
                                  ];
                                  nextTitles[sectionIndex] = nextTitle.slice(
                                    0,
                                    80,
                                  );
                                  queueGridContentSync(
                                    objectItem.id,
                                    {
                                      ...currentDraft,
                                      sectionTitles: nextTitles,
                                    },
                                    { immediate: true },
                                  );
                                }
                              : undefined
                          }
                          onCellColorChange={
                            canEdit
                              ? (cellIndex, color) => {
                                  const nextColors = Array.from(
                                    { length: gridTotalCells },
                                    (_, index) =>
                                      gridCellColors[
                                        index % gridCellColors.length
                                      ] ?? "#e2e8f0",
                                  );
                                  nextColors[cellIndex] = color;
                                  void updateDoc(
                                    doc(
                                      db,
                                      `boards/${boardId}/objects/${objectItem.id}`,
                                    ),
                                    {
                                      gridCellColors: nextColors,
                                      updatedAt: serverTimestamp(),
                                    },
                                  ).catch((error) => {
                                    console.error(
                                      "Failed to update grid container colors",
                                      error,
                                    );
                                    setBoardError(
                                      toBoardErrorMessage(
                                        error,
                                        "Failed to update grid container colors.",
                                      ),
                                    );
                                  });
                                }
                              : undefined
                          }
                          showCellColorPickers
                        />
                      ) : null}
                    </div>
                    {objectLabelText.length > 0 ? (
                      <div
                        style={{
                          position: "absolute",
                          left: "50%",
                          top: objectItem.type === "triangle" ? "66%" : "50%",
                          transform: "translate(-50%, -50%)",
                          maxWidth:
                            objectItem.type === "line"
                              ? Math.max(120, objectWidth - 24)
                              : objectItem.type === "triangle"
                                ? Math.max(96, objectWidth * 0.74)
                              : Math.max(76, objectWidth - 18),
                          padding:
                            objectItem.type === "line" ? "0.2rem 0.45rem" : "0.1rem 0.2rem",
                          borderRadius: objectItem.type === "line" ? 8 : 6,
                          border:
                            objectItem.type === "line"
                              ? "1px solid var(--border)"
                              : "none",
                          background:
                            objectItem.type === "line"
                              ? "var(--surface)"
                              : "transparent",
                          color:
                            objectItem.type === "line"
                              ? "var(--text)"
                              : getReadableTextColor(renderedObjectColor),
                          fontSize: 12,
                          fontWeight: 600,
                          lineHeight: 1.25,
                          textAlign: "center",
                          textShadow:
                            objectItem.type === "line"
                              ? "none"
                              : resolvedTheme === "dark"
                                ? "0 1px 2px rgba(2,6,23,0.55)"
                                : "0 1px 1px rgba(248,250,252,0.65)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          pointerEvents: "none",
                        }}
                        title={objectLabelText}
                      >
                        {objectLabelText}
                      </div>
                    ) : null}

                    {isSingleSelected &&
                    canEdit &&
                    objectItem.type !== "line" &&
                    objectItem.type !== "gridContainer" ? (
                      <>
                        <div
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: 0,
                            width: 2,
                            height: 16,
                            background: "#93c5fd",
                            transform: "translate(-50%, -102%)",
                            pointerEvents: "none",
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            startShapeRotate(objectItem.id, event)
                          }
                          aria-label="Rotate shape"
                          title="Drag to rotate shape (hold Shift to snap)"
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: 0,
                            transform: "translate(-50%, -168%)",
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: "1px solid #1d4ed8",
                            background: "var(--surface)",
                            boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
                            cursor: "grab",
                          }}
                        />
                      </>
                    ) : null}

                    {isSingleSelected &&
                    canEdit &&
                    objectItem.type !== "line" ? (
                      <div>
                        {CORNER_HANDLES.map((corner) => (
                          <button
                            key={corner}
                            type="button"
                            onPointerDown={(event) =>
                              startCornerResize(objectItem.id, corner, event)
                            }
                            style={{
                              position: "absolute",
                              ...getCornerPositionStyle(corner),
                              width: RESIZE_HANDLE_SIZE,
                              height: RESIZE_HANDLE_SIZE,
                              border: "1px solid #1d4ed8",
                              borderRadius: 2,
                              background: "var(--surface)",
                              cursor: getCornerCursor(corner),
                            }}
                            aria-label={`Resize ${corner} corner`}
                          />
                        ))}
                      </div>
                    ) : null}

                    {isSingleSelected &&
                    canEdit &&
                    objectItem.type === "line" &&
                    lineEndpointOffsets ? (
                      <>
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            startLineEndpointResize(
                              objectItem.id,
                              "start",
                              event,
                            )
                          }
                          aria-label="Adjust line start"
                          style={{
                            position: "absolute",
                            left:
                              lineEndpointOffsets.start.x -
                              RESIZE_HANDLE_SIZE / 2,
                            top:
                              lineEndpointOffsets.start.y -
                              RESIZE_HANDLE_SIZE / 2,
                            width: RESIZE_HANDLE_SIZE,
                            height: RESIZE_HANDLE_SIZE,
                            borderRadius: "50%",
                            border: "1px solid #1d4ed8",
                            background: "var(--surface)",
                            cursor: "move",
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={(event) =>
                            startLineEndpointResize(objectItem.id, "end", event)
                          }
                          aria-label="Adjust line end"
                          style={{
                            position: "absolute",
                            left:
                              lineEndpointOffsets.end.x -
                              RESIZE_HANDLE_SIZE / 2,
                            top:
                              lineEndpointOffsets.end.y -
                              RESIZE_HANDLE_SIZE / 2,
                            width: RESIZE_HANDLE_SIZE,
                            height: RESIZE_HANDLE_SIZE,
                            borderRadius: "50%",
                            border: "1px solid #1d4ed8",
                            background: "var(--surface)",
                            cursor: "move",
                          }}
                        />
                      </>
                    ) : null}
                  </article>
                );
              })}
            </div>

            {shouldShowConnectorAnchors
              ? connectorAnchorPoints.map((anchorPoint) => (
                  <span
                    key={`${anchorPoint.objectId}-${anchorPoint.anchor}`}
                    style={{
                      position: "absolute",
                      left: viewport.x + anchorPoint.x * viewport.scale - 4,
                      top: viewport.y + anchorPoint.y * viewport.scale - 4,
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      border: "1px solid var(--border-strong)",
                      background: "var(--surface)",
                      pointerEvents: "none",
                      zIndex: 38,
                    }}
                  />
                ))
              : null}

            {marqueeRect ? (
              <div
                style={{
                  position: "absolute",
                  left: viewport.x + marqueeRect.left * viewport.scale,
                  top: viewport.y + marqueeRect.top * viewport.scale,
                  width: Math.max(
                    1,
                    (marqueeRect.right - marqueeRect.left) * viewport.scale,
                  ),
                  height: Math.max(
                    1,
                    (marqueeRect.bottom - marqueeRect.top) * viewport.scale,
                  ),
                  border: "1px solid rgba(37, 99, 235, 0.95)",
                  background: "rgba(59, 130, 246, 0.16)",
                  pointerEvents: "none",
                  zIndex: 40,
                }}
              />
            ) : null}

            <RemoteCursorLayer
              remoteCursors={remoteCursors}
              viewport={viewport}
            />
          </div>
        </div>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <aside
          style={{
            minWidth: 0,
            minHeight: 0,
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {isRightPanelCollapsed ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <button
                type="button"
                onClick={() => setIsRightPanelCollapsed(false)}
                title="Expand online users panel"
                aria-label="Expand online users panel"
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  borderLeft: "1px solid var(--border-strong)",
                  borderRadius: 0,
                  background: "var(--surface-subtle)",
                  color: "var(--text)",
                  fontWeight: 700,
                  fontSize: 12,
                  letterSpacing: 0.3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.45rem",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    lineHeight: 1,
                  }}
                >
                  {"<"}
                </span>
                <span
                  style={{
                    writingMode: "vertical-rl",
                    transform: "rotate(180deg)",
                  }}
                >
                  Online users
                </span>
              </button>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: 0,
                  borderBottom: "1px solid var(--border)",
                  display: "grid",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsRightPanelCollapsed(true)}
                  title="Collapse online users panel"
                  aria-label="Collapse online users panel"
                  style={{
                    width: "100%",
                    height: 30,
                    border: "none",
                    borderRadius: 0,
                    borderBottom: "1px solid var(--border-strong)",
                    background: "var(--surface-subtle)",
                    color: "var(--text)",
                    fontWeight: 700,
                    fontSize: 12,
                    letterSpacing: 0.3,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.45rem",
                    cursor: "pointer",
                    transition:
                      "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
                  }}
                >
                  <span>Online users</span>
                  <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                    ({onlineUsers.length})
                  </span>
                  <span
                    style={{
                      fontSize: 16,
                      lineHeight: 1,
                    }}
                  >
                    {">"}
                  </span>
                </button>
              </div>

              <div
                style={{
                  padding: "0.75rem 0.8rem",
                  overflowY: "auto",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.45rem",
                  fontSize: 14,
                  color: "var(--text-muted)",
                }}
              >
                <OnlineUsersList onlineUsers={onlineUsers} />
              </div>
            </>
          )}
        </aside>
      </div>

      <footer
        style={{
          height: isAiFooterCollapsed
            ? AI_FOOTER_COLLAPSED_HEIGHT
            : aiFooterHeight,
          minHeight: isAiFooterCollapsed
            ? AI_FOOTER_COLLAPSED_HEIGHT
            : aiFooterHeight,
          maxHeight: isAiFooterCollapsed
            ? AI_FOOTER_COLLAPSED_HEIGHT
            : aiFooterHeight,
          borderTop: `${PANEL_SEPARATOR_WIDTH}px solid ${PANEL_SEPARATOR_COLOR}`,
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
          transition: isAiFooterResizing
            ? "none"
            : "height 220ms cubic-bezier(0.22, 1, 0.36, 1), min-height 220ms cubic-bezier(0.22, 1, 0.36, 1), max-height 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {!isAiFooterCollapsed ? (
          <div
            onPointerDown={handleAiFooterResizeStart}
            style={{
              height: 18,
              borderBottom: "1px solid var(--border)",
              cursor: "ns-resize",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--surface-muted)",
              touchAction: "none",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                width: 38,
                height: 3,
                borderRadius: 999,
                background: "var(--border)",
              }}
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => {
            setHasAiDrawerBeenInteracted(true);
            setIsAiFooterResizing(false);
            setIsAiFooterCollapsed((previous) => !previous);
          }}
          aria-label={
            isAiFooterCollapsed
              ? "Expand AI assistant drawer"
              : "Collapse AI assistant drawer"
          }
          title={
            isAiFooterCollapsed
              ? "Expand AI assistant drawer"
              : "Collapse AI assistant drawer"
          }
          style={{
            width: "100%",
            height: 30,
            border: "none",
            borderBottom: "1px solid var(--border-strong)",
            borderRadius: 0,
            background: isAiFooterCollapsed
              ? "var(--surface-subtle)"
              : "var(--surface-muted)",
            color: "var(--text)",
            fontWeight: 700,
            fontSize: 12,
            lineHeight: 1,
            cursor: "pointer",
            letterSpacing: 0.3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.45rem",
            flexShrink: 0,
            transform: isAiDrawerNudgeActive
              ? "translateY(-1px) scale(1.01)"
              : "translateY(0) scale(1)",
            boxShadow: isAiDrawerNudgeActive
              ? "0 0 0 4px rgba(14, 165, 233, 0.18)"
              : "none",
            transition:
              "background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 220ms ease, box-shadow 260ms ease",
          }}
        >
          <span
            style={{
              display: "inline-block",
              fontSize: 16,
              lineHeight: 1,
              transform: isAiFooterCollapsed
                ? "translateY(-1px) rotate(0deg)"
                : "translateY(1px) rotate(180deg)",
              transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          >
            ^
          </span>
          <span>AI Assistant</span>
        </button>

        {isAiFooterCollapsed ? (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "grid",
              alignItems: "stretch",
              padding: "0 clamp(0.8rem, 2vw, 1.5rem)",
            }}
          >
            <div
              style={{
                width: "min(100%, 800px)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
              }}
            >
              <strong style={{ fontSize: 13, color: "var(--text)" }}>
                AI Assistant
              </strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                ✨ Open for quick commands
              </span>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                padding: "0.45rem clamp(0.8rem, 2vw, 1.5rem)",
                borderBottom: "1px solid var(--border)",
                gap: "0.55rem",
              }}
            >
              <div
                style={{
                  width: "min(100%, 800px)",
                  margin: "0 auto",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ fontSize: 13, color: "var(--text)" }}>
                  AI Assistant
                </strong>
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Selected: {selectedObjectIds.length} • ask naturally (/help)
                </span>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "0.6rem clamp(0.8rem, 2vw, 1.5rem)",
                background: "var(--surface-muted)",
                overflow: "hidden",
              }}
            >
              <div
                ref={chatMessagesRef}
                style={{
                  height: "100%",
                  width: "min(100%, 800px)",
                  margin: "0 auto",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.5rem",
                  fontSize: 13,
                }}
              >
                {chatMessages.length === 0 ? (
                  isAiSubmitting ? (
                    <div
                      style={{
                        color: "var(--text-muted)",
                        lineHeight: 1.45,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      Thinking...
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-muted)", lineHeight: 1.45 }}>
                      Ask naturally, or type /help for example commands.
                    </span>
                  )
                ) : (
                  <>
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        style={{
                          display: "flex",
                          justifyContent:
                            message.role === "user" ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={{
                            maxWidth: "min(88%, 700px)",
                            border: "1px solid var(--border)",
                            borderRadius: 10,
                            padding: "0.5rem 0.65rem",
                            lineHeight: 1.45,
                            whiteSpace: "pre-wrap",
                            background:
                              message.role === "user"
                                ? "var(--chat-user-bubble)"
                                : "var(--chat-ai-bubble)",
                            color:
                              message.role === "user"
                                ? "var(--text)"
                                : "var(--text)",
                          }}
                        >
                          {message.text}
                        </div>
                      </div>
                    ))}
                    {isAiSubmitting ? (
                      <div
                        style={{
                          color: "var(--text-muted)",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        Thinking...
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <form
              onSubmit={handleAiChatSubmit}
              style={{
                display: "grid",
                padding: "0.55rem clamp(0.8rem, 2vw, 1.5rem)",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: "min(100%, 800px)",
                  margin: "0 auto",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                <input
                  value={chatInput}
                  onChange={handleChatInputChange}
                  onKeyDown={handleChatInputKeyDown}
                  disabled={isAiSubmitting}
                  placeholder="Ask the AI assistant to update this board..."
                  maxLength={500}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "0.48rem 0.58rem",
                    border: "1px solid var(--input-border)",
                    borderRadius: 8,
                    background: "var(--input-bg)",
                    color: "var(--text)",
                  }}
                />
                <button
                  type="submit"
                  disabled={isAiSubmitting || chatInput.trim().length === 0}
                >
                  {isAiSubmitting ? "Thinking..." : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </footer>
    </section>
  );
}
