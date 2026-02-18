"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent as ReactFormEvent,
  type PointerEvent as ReactPointerEvent
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
  writeBatch
} from "firebase/firestore";

import type {
  BoardObject,
  BoardObjectKind,
  BoardPermissions,
  PresenceUser
} from "@/features/boards/types";
import {
  AI_COMMAND_REQUEST_TIMEOUT_MS,
  getBoardCommandErrorMessage
} from "@/features/ai/board-command";
import {
  createRealtimeWriteMetrics,
  isWriteMetricsDebugEnabled
} from "@/features/boards/lib/realtime-write-metrics";
import { getFirebaseClientDb } from "@/lib/firebase/client";

// Cost/perf tradeoff: keep cursors smooth while cutting high-frequency write churn.
const CURSOR_THROTTLE_MS = 120;
const DRAG_THROTTLE_MS = 45;
const DRAG_CLICK_SLOP_PX = 3;
const STICKY_TEXT_SYNC_THROTTLE_MS = 180;
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
};

type CornerResizeState = {
  objectId: string;
  objectType: Exclude<BoardObjectKind, "line">;
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

type ColorSwatch = {
  name: string;
  value: string;
};

const BOARD_TOOLS: BoardObjectKind[] = [
  "sticky",
  "rect",
  "circle",
  "line",
  "triangle",
  "star"
];
const RESIZE_THROTTLE_MS = 45;
const ROTATE_THROTTLE_MS = 45;
const RESIZE_HANDLE_SIZE = 10;
const LINE_MIN_LENGTH = 40;
const SELECTED_OBJECT_HALO = "0 0 0 2px rgba(59, 130, 246, 0.45), 0 8px 14px rgba(0,0,0,0.14)";
const OBJECT_SPAWN_STEP_PX = 20;
const PANEL_SEPARATOR_COLOR = "#6f8196";
const PANEL_SEPARATOR_WIDTH = 4;
const LEFT_PANEL_WIDTH = 232;
const RIGHT_PANEL_WIDTH = 238;
const COLLAPSED_PANEL_WIDTH = 48;
const AI_FOOTER_DEFAULT_HEIGHT = 220;
const AI_FOOTER_MIN_HEIGHT = 140;
const AI_FOOTER_MAX_HEIGHT = 460;
const AI_FOOTER_COLLAPSED_HEIGHT = 46;
const AI_FOOTER_HEIGHT_STORAGE_KEY = "collabboard-ai-footer-height-v1";
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
  { name: "Tan", value: "#d2b48c" }
];

const INITIAL_VIEWPORT: ViewportState = {
  x: 120,
  y: 80,
  scale: 1
};

function clampScale(nextScale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));
}

function clampAiFooterHeight(nextHeight: number): number {
  return Math.min(AI_FOOTER_MAX_HEIGHT, Math.max(AI_FOOTER_MIN_HEIGHT, Math.round(nextHeight)));
}

function getAcceleratedWheelZoomDelta(deltaY: number): number {
  const magnitude = Math.abs(deltaY);
  const acceleration = 1 + Math.min(2.4, magnitude / 110);
  const acceleratedMagnitude = Math.min(
    ZOOM_WHEEL_MAX_EFFECTIVE_DELTA,
    magnitude * acceleration
  );

  return Math.sign(deltaY) * acceleratedMagnitude;
}

function toNormalizedRect(start: BoardPoint, end: BoardPoint): {
  left: number;
  right: number;
  top: number;
  bottom: number;
} {
  return {
    left: Math.min(start.x, end.x),
    right: Math.max(start.x, end.x),
    top: Math.min(start.y, end.y),
    bottom: Math.max(start.y, end.y)
  };
}

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
    y: gridY * step
  };
}

function createChatMessageId(prefix: "u" | "a"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  return null;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTimestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return null;
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTimestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

function hashToColor(input: string): string {
  const palette = [
    "#2563eb",
    "#0ea5e9",
    "#0891b2",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#7c3aed",
    "#db2777"
  ];

  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }

  return palette[Math.abs(hash) % palette.length];
}

function isBoardObjectKind(value: unknown): value is BoardObjectKind {
  return (
    value === "sticky" ||
    value === "rect" ||
    value === "circle" ||
    value === "line" ||
    value === "triangle" ||
    value === "star"
  );
}

function getDefaultObjectSize(kind: BoardObjectKind): { width: number; height: number } {
  if (kind === "sticky") {
    return { width: 220, height: 170 };
  }

  if (kind === "rect") {
    return { width: 240, height: 150 };
  }

  if (kind === "circle") {
    return { width: 170, height: 170 };
  }

  if (kind === "triangle") {
    return { width: 180, height: 170 };
  }

  if (kind === "star") {
    return { width: 180, height: 180 };
  }

  return { width: 240, height: 64 };
}

function getMinimumObjectSize(kind: BoardObjectKind): { width: number; height: number } {
  if (kind === "sticky") {
    return { width: 140, height: 100 };
  }

  if (kind === "rect") {
    return { width: 80, height: 60 };
  }

  if (kind === "circle") {
    return { width: 80, height: 80 };
  }

  if (kind === "triangle" || kind === "star") {
    return { width: 80, height: 80 };
  }

  return { width: LINE_MIN_LENGTH, height: 32 };
}

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

  if (kind === "triangle") {
    return "#c4b5fd";
  }

  if (kind === "star") {
    return "#fcd34d";
  }

  return "#1f2937";
}

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

  if (kind === "triangle") {
    return "Triangle";
  }

  if (kind === "star") {
    return "Star";
  }

  return "Line";
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function toWritePoint(point: BoardPoint): BoardPoint {
  return {
    x: roundToStep(point.x, POSITION_WRITE_STEP),
    y: roundToStep(point.y, POSITION_WRITE_STEP)
  };
}

function getDistance(left: BoardPoint, right: BoardPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function arePointsClose(left: BoardPoint, right: BoardPoint, epsilon: number): boolean {
  return Math.abs(left.x - right.x) <= epsilon && Math.abs(left.y - right.y) <= epsilon;
}

function normalizeRotationDeg(rotationDeg: number): number {
  return ((rotationDeg % 360) + 360) % 360;
}

function getRotationDelta(leftRotationDeg: number, rightRotationDeg: number): number {
  const normalizedLeft = normalizeRotationDeg(leftRotationDeg);
  const normalizedRight = normalizeRotationDeg(rightRotationDeg);
  const rawDelta = Math.abs(normalizedLeft - normalizedRight);
  return Math.min(rawDelta, 360 - rawDelta);
}

function areGeometriesClose(
  leftGeometry: ObjectGeometry,
  rightGeometry: ObjectGeometry
): boolean {
  return (
    Math.abs(leftGeometry.x - rightGeometry.x) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.y - rightGeometry.y) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.width - rightGeometry.width) <= GEOMETRY_WRITE_EPSILON &&
    Math.abs(leftGeometry.height - rightGeometry.height) <= GEOMETRY_WRITE_EPSILON &&
    getRotationDelta(leftGeometry.rotationDeg, rightGeometry.rotationDeg) <=
      GEOMETRY_ROTATION_EPSILON_DEG
  );
}

function hasMeaningfulRotation(rotationDeg: number): boolean {
  const normalized = normalizeRotationDeg(rotationDeg);
  const distanceToZero = Math.min(normalized, 360 - normalized);
  return distanceToZero > 0.25;
}

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
    { x: -halfWidth, y: halfHeight }
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

function getObjectVisualBounds(type: BoardObjectKind, geometry: ObjectGeometry): ObjectBounds {
  if (type === "line") {
    const endpoints = getLineEndpoints(geometry);
    return {
      left: Math.min(endpoints.start.x, endpoints.end.x),
      right: Math.max(endpoints.start.x, endpoints.end.x),
      top: Math.min(endpoints.start.y, endpoints.end.y),
      bottom: Math.max(endpoints.start.y, endpoints.end.y)
    };
  }

  return getRotatedBounds(geometry);
}

function mergeBounds(bounds: ObjectBounds[]): ObjectBounds | null {
  if (bounds.length === 0) {
    return null;
  }

  return bounds.reduce((combined, current) => ({
    left: Math.min(combined.left, current.left),
    right: Math.max(combined.right, current.right),
    top: Math.min(combined.top, current.top),
    bottom: Math.max(combined.bottom, current.bottom)
  }));
}

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
      y: centerY - sin * halfLength
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength
    }
  };
}

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
      y: centerY - sin * halfLength
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength
    }
  };
}

function ToolIcon({ kind }: { kind: BoardObjectKind }) {
  if (kind === "sticky") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="1.8" fill="#fde68a" stroke="#b08928" />
        <rect x="3.2" y="3.2" width="9.6" height="2.2" rx="0.8" fill="#fcd34d" />
        <line x1="4.1" y1="7.2" x2="11.9" y2="7.2" stroke="#9a7b19" strokeWidth="0.9" />
        <line x1="4.1" y1="9.4" x2="10.4" y2="9.4" stroke="#9a7b19" strokeWidth="0.9" />
      </svg>
    );
  }

  if (kind === "rect") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="0.5" fill="#93c5fd" stroke="#1d4ed8" />
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

  if (kind === "triangle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <polygon points="8,2 14,13 2,13" fill="#c4b5fd" stroke="#6d28d9" strokeWidth="1.1" />
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
      <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="#1f2937" strokeWidth="2.5" />
    </svg>
  );
}

function ColorSwatchPicker({
  currentColor,
  onSelectColor
}: {
  currentColor: string | null;
  onSelectColor: (nextColor: string) => void;
}) {
  const currentColorKey = currentColor ? currentColor.toLowerCase() : null;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, 18px)",
        gap: 6
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {BOARD_COLOR_SWATCHES.map((swatch) => {
        const isSelected =
          currentColorKey !== null && swatch.value.toLowerCase() === currentColorKey;

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
              border: isSelected ? "2px solid #0f172a" : "1px solid rgba(15, 23, 42, 0.25)",
              boxSizing: "border-box",
              background: swatch.value,
              cursor: "pointer"
            }}
          />
        );
      })}
    </div>
  );
}

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

const CORNER_HANDLES: ResizeCorner[] = ["nw", "ne", "sw", "se"];

function getCornerCursor(corner: ResizeCorner): string {
  return corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
}

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

function toBoardObject(rawId: string, rawData: Record<string, unknown>): BoardObject | null {
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
    updatedAt: getTimestampIso(rawData.updatedAt)
  };
}

function toPresenceUser(rawId: string, rawData: Record<string, unknown>): PresenceUser {
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
    lastSeenAt
  };
}

function getPresenceLabel(user: PresenceUser): string {
  return user.displayName ?? user.email ?? user.uid;
}

function toBoardErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
    };

    const code = typeof candidate.code === "string" ? candidate.code : null;
    const message = typeof candidate.message === "string" ? candidate.message : null;

    if (code === "permission-denied") {
      return `${fallback} Firestore denied the request (permission-denied).`;
    }

    if (code && message) {
      return `${fallback} (${code}: ${message})`;
    }

    if (code) {
      return `${fallback} (${code})`;
    }

    if (message) {
      return `${fallback} (${message})`;
    }
  }

  if (typeof error === "string" && error.length > 0) {
    return `${fallback} (${error})`;
  }

  return fallback;
}

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions
}: RealtimeBoardCanvasProps) {
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const selectionHudRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cornerResizeStateRef = useRef<CornerResizeState | null>(null);
  const lineEndpointResizeStateRef = useRef<LineEndpointResizeState | null>(null);
  const rotateStateRef = useRef<RotateState | null>(null);
  const marqueeSelectionStateRef = useRef<MarqueeSelectionState | null>(null);
  const aiFooterResizeStateRef = useRef<AiFooterResizeState | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());
  const objectSpawnSequenceRef = useRef(0);
  const selectedObjectIdsRef = useRef<Set<string>>(new Set());
  const draftGeometryByIdRef = useRef<Record<string, ObjectGeometry>>({});
  const stickyTextSyncStateRef = useRef<Map<string, StickyTextSyncState>>(new Map());
  const sendCursorAtRef = useRef(0);
  const canEditRef = useRef(canEdit);
  const lastCursorWriteRef = useRef<BoardPoint | null>(null);
  const lastPositionWriteByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const lastGeometryWriteByIdRef = useRef<Map<string, ObjectGeometry>>(new Map());
  const lastStickyWriteByIdRef = useRef<Map<string, string>>(new Map());
  const writeMetricsRef = useRef(createRealtimeWriteMetrics());

  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [draftGeometryById, setDraftGeometryById] = useState<Record<string, ObjectGeometry>>(
    {}
  );
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [marqueeSelectionState, setMarqueeSelectionState] =
    useState<MarqueeSelectionState | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isAiFooterCollapsed, setIsAiFooterCollapsed] = useState(false);
  const [aiFooterHeight, setAiFooterHeight] = useState(AI_FOOTER_DEFAULT_HEIGHT);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectionHudSize, setSelectionHudSize] = useState({ width: 0, height: 0 });

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/objects`),
    [boardId, db]
  );
  const presenceCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/presence`),
    [boardId, db]
  );
  const selfPresenceRef = useMemo(
    () => doc(db, `boards/${boardId}/presence/${user.uid}`),
    [boardId, db, user.uid]
  );

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    objectsByIdRef.current = new Map(objects.map((item) => [item.id, item]));

    const objectIds = new Set(objects.map((item) => item.id));
    [lastPositionWriteByIdRef.current, lastGeometryWriteByIdRef.current, lastStickyWriteByIdRef.current]
      .forEach((cache) => {
        Array.from(cache.keys()).forEach((objectId) => {
          if (!objectIds.has(objectId)) {
            cache.delete(objectId);
          }
        });
      });
  }, [objects]);

  useEffect(() => {
    draftGeometryByIdRef.current = draftGeometryById;
  }, [draftGeometryById]);

  useEffect(() => {
    selectedObjectIdsRef.current = new Set(selectedObjectIds);
  }, [selectedObjectIds]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedHeight = window.localStorage.getItem(AI_FOOTER_HEIGHT_STORAGE_KEY);
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

    window.localStorage.setItem(AI_FOOTER_HEIGHT_STORAGE_KEY, String(aiFooterHeight));
  }, [aiFooterHeight]);

  useEffect(() => {
    const element = chatMessagesRef.current;
    if (!element || isAiFooterCollapsed) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [chatMessages, isAiFooterCollapsed]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !isWriteMetricsDebugEnabled()) {
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

    const syncStageSize = () => {
      setStageSize({
        width: stageElement.clientWidth,
        height: stageElement.clientHeight
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

    return () => {
      syncStates.forEach((syncState) => {
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
        }
      });
      syncStates.clear();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

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
    (payload: { active: boolean; cursorX: number | null; cursorY: number | null }, keepalive: boolean) => {
      const idToken = idTokenRef.current;
      if (!idToken) {
        return;
      }

      void fetch(`/api/boards/${boardId}/presence`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive
      }).catch(() => {
        // Best-effort fallback for tab close/navigation transitions.
      });
    },
    [boardId]
  );

  const markPresenceInactive = useCallback(
    (keepalive: boolean) => {
      lastCursorWriteRef.current = null;

      const payload = {
        active: false,
        cursorX: null,
        cursorY: null
      };

      void setDoc(
        selfPresenceRef,
        {
          ...payload,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp()
        },
        { merge: true }
      ).catch(() => {
        // Ignore write failures during navigation/tab close.
      });

      pushPresencePatchToApi(payload, keepalive);
    },
    [pushPresencePatchToApi, selfPresenceRef]
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      objectsCollectionRef,
      (snapshot) => {
        const nextObjects: BoardObject[] = [];
        snapshot.docs.forEach((documentSnapshot) => {
          const parsed = toBoardObject(
            documentSnapshot.id,
            documentSnapshot.data() as Record<string, unknown>
          );
          if (parsed) {
            nextObjects.push(parsed);
          }
        });

        nextObjects.sort((left, right) => {
          if (left.zIndex !== right.zIndex) {
            return left.zIndex - right.zIndex;
          }

          return left.id.localeCompare(right.id);
        });

        const nextObjectIds = new Set(nextObjects.map((objectItem) => objectItem.id));
        setSelectedObjectIds((previous) =>
          previous.filter((objectId) => nextObjectIds.has(objectId))
        );

        setObjects(nextObjects);
      },
      (error) => {
        console.error("Failed to sync board objects", error);
        setBoardError(toBoardErrorMessage(error, "Failed to sync board objects."));
      }
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
              serverTimestamps: "estimate"
            }) as Record<string, unknown>
          )
        );
        setPresenceUsers(users);
      },
      (error) => {
        console.error("Failed to sync presence", error);
      }
    );

    return unsubscribe;
  }, [presenceCollectionRef]);

  useEffect(() => {
    const setPresenceState = async (cursor: BoardPoint | null, active: boolean) => {
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
          lastSeenAt: serverTimestamp()
        },
        { merge: true }
      );
    };

    void setPresenceState(null, true);

    const heartbeatInterval = window.setInterval(() => {
      void setPresenceState(null, true);
    }, PRESENCE_HEARTBEAT_MS);

    const presenceTicker = window.setInterval(() => {
      setPresenceClock(Date.now());
    }, 5_000);

    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearInterval(presenceTicker);
      markPresenceInactive(false);
    };
  }, [boardColor, markPresenceInactive, selfPresenceRef, user.displayName, user.email, user.uid]);

  useEffect(() => {
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

  const getCurrentObjectGeometry = useCallback((objectId: string): ObjectGeometry | null => {
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
      rotationDeg: objectItem.rotationDeg
    };
  }, []);

  const setDraftGeometry = useCallback((objectId: string, geometry: ObjectGeometry) => {
    setDraftGeometryById((previous) => ({
      ...previous,
      [objectId]: geometry
    }));
  }, []);

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

  const updateObjectGeometry = useCallback(
    async (objectId: string, geometry: ObjectGeometry, options: ObjectWriteOptions = {}) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("object-geometry");

      if (!canEditRef.current) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      const includeUpdatedAt = options.includeUpdatedAt ?? true;
      const force = options.force ?? false;
      const nextGeometry: ObjectGeometry = {
        x: roundToStep(geometry.x, POSITION_WRITE_STEP),
        y: roundToStep(geometry.y, POSITION_WRITE_STEP),
        width: roundToStep(geometry.width, POSITION_WRITE_STEP),
        height: roundToStep(geometry.height, POSITION_WRITE_STEP),
        rotationDeg: geometry.rotationDeg
      };
      const objectItem = objectsByIdRef.current.get(objectId);
      const previousGeometry =
        lastGeometryWriteByIdRef.current.get(objectId) ??
        (objectItem
          ? {
              x: objectItem.x,
              y: objectItem.y,
              width: objectItem.width,
              height: objectItem.height,
              rotationDeg: objectItem.rotationDeg
            }
          : null);

      if (!force && previousGeometry && areGeometriesClose(previousGeometry, nextGeometry)) {
        writeMetrics.markSkipped("object-geometry");
        return;
      }

      try {
        const payload: Record<string, unknown> = {
          x: nextGeometry.x,
          y: nextGeometry.y,
          width: nextGeometry.width,
          height: nextGeometry.height,
          rotationDeg: nextGeometry.rotationDeg
        };
        if (includeUpdatedAt) {
          payload.updatedAt = serverTimestamp();
        }

        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), payload);
        lastGeometryWriteByIdRef.current.set(objectId, nextGeometry);
        lastPositionWriteByIdRef.current.set(objectId, {
          x: nextGeometry.x,
          y: nextGeometry.y
        });
        writeMetrics.markCommitted("object-geometry");
      } catch (error) {
        console.error("Failed to update object transform", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update object transform."));
      }
    },
    [boardId, db]
  );

  const updateObjectPositionsBatch = useCallback(
    async (
      nextPositionsById: Record<string, BoardPoint>,
      options: ObjectWriteOptions = {}
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
                  y: objectItem.y
                }
              : null);

          if (!force && previousPosition && arePointsClose(previousPosition, nextPosition, POSITION_WRITE_EPSILON)) {
            skippedCount += 1;
            return;
          }

          const updatePayload: Record<string, unknown> = {
            x: nextPosition.x,
            y: nextPosition.y
          };
          if (includeUpdatedAt) {
            updatePayload.updatedAt = serverTimestamp();
          }

          batch.update(doc(db, `boards/${boardId}/objects/${objectId}`), updatePayload);
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
          const previousGeometry = lastGeometryWriteByIdRef.current.get(objectId);
          if (previousGeometry) {
            lastGeometryWriteByIdRef.current.set(objectId, {
              ...previousGeometry,
              x: position.x,
              y: position.y
            });
          }
        });
      } catch (error) {
        console.error("Failed to update object positions", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update object positions."));
      }
    },
    [boardId, db]
  );

  const getObjectSelectionBounds = useCallback(
    (objectItem: BoardObject) => {
      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return {
          left: objectItem.x,
          right: objectItem.x + objectItem.width,
          top: objectItem.y,
          bottom: objectItem.y + objectItem.height
        };
      }

      return getObjectVisualBounds(objectItem.type, geometry);
    },
    [getCurrentObjectGeometry]
  );

  const getObjectsIntersectingRect = useCallback(
    (rect: { left: number; right: number; top: number; bottom: number }): string[] => {
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
    [getObjectSelectionBounds]
  );

  const getResizedGeometry = useCallback(
    (
      state: CornerResizeState,
      clientX: number,
      clientY: number,
      scale: number
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
        const size = Math.max(minimumSize.width, Math.max(nextWidth, nextHeight));
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

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        rotationDeg: state.initialGeometry.rotationDeg
      };
    },
    []
  );

  const getLineGeometryFromEndpointDrag = useCallback(
    (state: LineEndpointResizeState, movingPoint: BoardPoint): ObjectGeometry => {
      const dx = movingPoint.x - state.fixedPoint.x;
      const dy = movingPoint.y - state.fixedPoint.y;
      const distance = Math.hypot(dx, dy);
      const length = Math.max(LINE_MIN_LENGTH, distance);
      const angle = distance < 0.001 ? 0 : toDegrees(Math.atan2(dy, dx));

      const normalizedX = distance < 0.001 ? 1 : dx / distance;
      const normalizedY = distance < 0.001 ? 0 : dy / distance;
      const adjustedMovingPoint = {
        x: state.fixedPoint.x + normalizedX * length,
        y: state.fixedPoint.y + normalizedY * length
      };

      const startPoint =
        state.endpoint === "start" ? adjustedMovingPoint : state.fixedPoint;
      const endPoint = state.endpoint === "end" ? adjustedMovingPoint : state.fixedPoint;
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;

      return {
        x: centerX - length / 2,
        y: centerY - state.handleHeight / 2,
        width: length,
        height: state.handleHeight,
        rotationDeg: angle
      };
    },
    []
  );

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const aiFooterResizeState = aiFooterResizeStateRef.current;
      if (aiFooterResizeState) {
        const deltaY = aiFooterResizeState.startClientY - event.clientY;
        const nextHeight = clampAiFooterHeight(aiFooterResizeState.initialHeight + deltaY);
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
          scale
        );

        setDraftGeometry(cornerResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (canEditRef.current && now - cornerResizeState.lastSentAt >= RESIZE_THROTTLE_MS) {
          cornerResizeState.lastSentAt = now;
          void updateObjectGeometry(cornerResizeState.objectId, nextGeometry, {
            includeUpdatedAt: false
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
          y: (event.clientY - rect.top - viewportRef.current.y) / scale
        };

        const nextGeometry = getLineGeometryFromEndpointDrag(
          lineEndpointResizeState,
          movingPoint
        );

        setDraftGeometry(lineEndpointResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - lineEndpointResizeState.lastSentAt >= RESIZE_THROTTLE_MS
        ) {
          lineEndpointResizeState.lastSentAt = now;
          void updateObjectGeometry(lineEndpointResizeState.objectId, nextGeometry, {
            includeUpdatedAt: false
          });
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
          y: (event.clientY - rect.top - viewportRef.current.y) / scale
        };

        const pointerAngleDeg = toDegrees(
          Math.atan2(
            pointer.y - rotateState.centerPoint.y,
            pointer.x - rotateState.centerPoint.x
          )
        );
        const deltaAngle = pointerAngleDeg - rotateState.initialPointerAngleDeg;
        let nextRotationDeg = rotateState.initialRotationDeg + deltaAngle;

        if (event.shiftKey) {
          nextRotationDeg = Math.round(nextRotationDeg / 15) * 15;
        }

        const normalizedRotationDeg =
          ((nextRotationDeg % 360) + 360) % 360;

        const geometry = getCurrentObjectGeometry(rotateState.objectId);
        if (!geometry) {
          return;
        }

        const nextGeometry: ObjectGeometry = {
          ...geometry,
          rotationDeg: normalizedRotationDeg
        };
        setDraftGeometry(rotateState.objectId, nextGeometry);

        const now = Date.now();
        if (canEditRef.current && now - rotateState.lastSentAt >= ROTATE_THROTTLE_MS) {
          rotateState.lastSentAt = now;
          void updateObjectGeometry(rotateState.objectId, nextGeometry, {
            includeUpdatedAt: false
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
          y: (event.clientY - rect.top - viewportRef.current.y) / scale
        };

        const nextMarqueeState: MarqueeSelectionState = {
          ...marqueeSelectionState,
          currentPoint: nextPoint
        };

        marqueeSelectionStateRef.current = nextMarqueeState;
        setMarqueeSelectionState(nextMarqueeState);
        return;
      }

      const panState = panStateRef.current;
      if (panState) {
        const nextX = panState.initialX + (event.clientX - panState.startClientX);
        const nextY = panState.initialY + (event.clientY - panState.startClientY);
        setViewport((previous) => ({
          x: nextX,
          y: nextY,
          scale: previous.scale
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

        dragState.objectIds.forEach((objectId) => {
          const initialGeometry = dragState.initialGeometries[objectId];
          const currentGeometry = getCurrentObjectGeometry(objectId);
          if (!initialGeometry || !currentGeometry) {
            return;
          }

          const nextX = initialGeometry.x + deltaX;
          const nextY = initialGeometry.y + deltaY;

          nextPositionsById[objectId] = {
            x: nextX,
            y: nextY
          };

          setDraftGeometry(objectId, {
            ...currentGeometry,
            x: nextX,
            y: nextY
          });
        });

        const now = Date.now();
        if (canEditRef.current && now - dragState.lastSentAt >= DRAG_THROTTLE_MS) {
          dragState.lastSentAt = now;
          void updateObjectPositionsBatch(nextPositionsById, {
            includeUpdatedAt: false
          });
        }
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (aiFooterResizeStateRef.current) {
        aiFooterResizeStateRef.current = null;
        return;
      }

      const cornerResizeState = cornerResizeStateRef.current;
      if (cornerResizeState) {
        cornerResizeStateRef.current = null;
        const finalGeometry = draftGeometryByIdRef.current[cornerResizeState.objectId];
        clearDraftGeometry(cornerResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(cornerResizeState.objectId, finalGeometry, {
            includeUpdatedAt: true,
            force: true
          });
        }
        return;
      }

      const lineEndpointResizeState = lineEndpointResizeStateRef.current;
      if (lineEndpointResizeState) {
        lineEndpointResizeStateRef.current = null;
        const finalGeometry = draftGeometryByIdRef.current[lineEndpointResizeState.objectId];
        clearDraftGeometry(lineEndpointResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(lineEndpointResizeState.objectId, finalGeometry, {
            includeUpdatedAt: true,
            force: true
          });
        }
        return;
      }

      const rotateState = rotateStateRef.current;
      if (rotateState) {
        rotateStateRef.current = null;
        const finalGeometry = draftGeometryByIdRef.current[rotateState.objectId];
        clearDraftGeometry(rotateState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(rotateState.objectId, finalGeometry, {
            includeUpdatedAt: true,
            force: true
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
          marqueeSelectionState.currentPoint
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
            previous.filter((objectId) => !removeSet.has(objectId))
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
        dragState.objectIds.forEach((objectId) => {
          const initialGeometry = dragState.initialGeometries[objectId];
          if (!initialGeometry) {
            return;
          }

          clearDraftGeometry(objectId);
          nextPositionsById[objectId] = {
            x: initialGeometry.x + deltaX,
            y: initialGeometry.y + deltaY
          };
        });

        void updateObjectPositionsBatch(nextPositionsById, {
          includeUpdatedAt: true,
          force: true
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
    clearDraftGeometry,
    getObjectsIntersectingRect,
    getCurrentObjectGeometry,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    setDraftGeometry,
    updateObjectGeometry,
    updateObjectPositionsBatch
  ]);

  const toBoardCoordinates = useCallback(
    (clientX: number, clientY: number): BoardPoint | null => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return null;
      }

      const rect = stageElement.getBoundingClientRect();
      const x = (clientX - rect.left - viewportRef.current.x) / viewportRef.current.scale;
      const y = (clientY - rect.top - viewportRef.current.y) / viewportRef.current.scale;

      return { x, y };
    },
    []
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
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
        lastCursorWriteRef.current = nextCursor;
        writeMetrics.markCommitted("cursor");
      } catch {
        // Ignore cursor write failures to avoid interrupting interactions.
      }
    },
    [selfPresenceRef]
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
      const centerX = (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
      const centerY = (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
      const { width, height } = getDefaultObjectSize(kind);
      const spawnIndex = objectsByIdRef.current.size + objectSpawnSequenceRef.current;
      objectSpawnSequenceRef.current += 1;
      const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
      const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
        0
      );
      const nextZIndex = highestZIndex + 1;

      try {
        await addDoc(objectsCollectionRef, {
          type: kind,
          zIndex: nextZIndex,
          x: centerX - width / 2 + spawnOffset.x,
          y: centerY - height / 2 + spawnOffset.y,
          width,
          height,
          rotationDeg: 0,
          color: getDefaultObjectColor(kind),
          text: kind === "sticky" ? "New sticky note" : "",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to create object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to create object."));
      }
    },
    [canEdit, objectsCollectionRef, user.uid]
  );

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
        setTextDrafts((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
        setSelectedObjectIds((previous) => previous.filter((id) => id !== objectId));
      } catch (error) {
        console.error("Failed to delete object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to delete object."));
      }
    },
    [boardId, canEdit, db]
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
          updatedAt: serverTimestamp()
        });
        lastStickyWriteByIdRef.current.set(objectId, normalizedText);
        const syncState = stickyTextSyncStateRef.current.get(objectId);
        if (syncState) {
          syncState.lastSentText = normalizedText;
        }
        writeMetrics.markCommitted("sticky-text");
      } catch (error) {
        console.error("Failed to update sticky text", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update sticky text."));
      }
    },
    [boardId, db]
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
    [saveStickyText]
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
            lastStickyWriteByIdRef.current.get(objectId) ?? objectItem?.text ?? null,
          timerId: null
        };
        syncStates.set(objectId, syncState);
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      const lastSavedText =
        syncState.lastSentText ?? lastStickyWriteByIdRef.current.get(objectId) ?? null;
      if (normalizedText === lastSavedText || (objectItem && objectItem.text === normalizedText)) {
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
    [saveStickyText]
  );

  const saveSelectedObjectsColor = useCallback(
    async (color: string) => {
      if (!canEditRef.current) {
        return;
      }

      const objectIdsToUpdate = Array.from(selectedObjectIdsRef.current).filter((objectId) =>
        objectsByIdRef.current.has(objectId)
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
            updatedAt
          });
        });

        await batch.commit();
      } catch (error) {
        console.error("Failed to update selected object colors", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update selected object colors."));
      }
    },
    [boardId, db]
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
          item
        ): item is {
          objectId: string;
          geometry: ObjectGeometry;
        } => item !== null
      )
      .filter((item) => hasMeaningfulRotation(item.geometry.rotationDeg));

    if (targets.length === 0) {
      return;
    }

    rotateStateRef.current = null;

    targets.forEach((target) => {
      setDraftGeometry(target.objectId, {
        ...target.geometry,
        rotationDeg: 0
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
          updatedAt
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Failed to reset selected object rotation", error);
      setBoardError(toBoardErrorMessage(error, "Failed to reset selected object rotation."));
    } finally {
      targets.forEach((target) => {
        window.setTimeout(() => {
          clearDraftGeometry(target.objectId);
        }, 180);
      });
    }
  }, [boardId, clearDraftGeometry, db, getCurrentObjectGeometry, setDraftGeometry]);

  const selectSingleObject = useCallback((objectId: string) => {
    setSelectedObjectIds((previous) =>
      previous.length === 1 && previous[0] === objectId ? previous : [objectId]
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
    void Promise.all(objectIdsToDelete.map((objectId) => deleteObject(objectId)));
  }, [canEdit, deleteObject, selectedObjectIds]);

  const handleToolButtonClick = useCallback(
    (toolKind: BoardObjectKind) => {
      void createObject(toolKind);
    },
    [createObject]
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
        initialHeight: aiFooterHeight
      };
    },
    [aiFooterHeight, isAiFooterCollapsed]
  );

  const handleAiChatSubmit = useCallback(
    (event: ReactFormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const nextMessage = chatInput.trim();
      if (nextMessage.length === 0 || isAiSubmitting) {
        return;
      }

      setChatMessages((previous) => {
        const next = [...previous];
        next.push({
          id: createChatMessageId("u"),
          role: "user",
          text: nextMessage
        });
        return next;
      });
      setChatInput("");
      setIsAiSubmitting(true);

      void (async () => {
        const requestController = new AbortController();
        const timeoutId = window.setTimeout(() => {
          requestController.abort();
        }, AI_COMMAND_REQUEST_TIMEOUT_MS);

        try {
          const idToken = idTokenRef.current ?? (await user.getIdToken());
          idTokenRef.current = idToken;

          const response = await fetch("/api/ai/board-command", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${idToken}`,
              "Content-Type": "application/json"
            },
            signal: requestController.signal,
            body: JSON.stringify({
              boardId,
              message: nextMessage,
              selectedObjectIds: Array.from(selectedObjectIdsRef.current)
            })
          });

          if (!response.ok) {
            const assistantMessage = getBoardCommandErrorMessage({
              status: response.status
            });
            setChatMessages((previous) => [
              ...previous,
              {
                id: createChatMessageId("a"),
                role: "assistant",
                text: assistantMessage
              }
            ]);
            return;
          }

          const payload = (await response.json()) as {
            assistantMessage?: unknown;
          };
          const assistantMessage =
            typeof payload.assistantMessage === "string" && payload.assistantMessage.trim()
              ? payload.assistantMessage
              : "AI agent coming soon!";

          setChatMessages((previous) => [
            ...previous,
            {
              id: createChatMessageId("a"),
              role: "assistant",
              text: assistantMessage
            }
          ]);
        } catch (error) {
          const timedOut = error instanceof DOMException && error.name === "AbortError";
          const assistantMessage = getBoardCommandErrorMessage({
            status: null,
            timedOut
          });

          setChatMessages((previous) => [
            ...previous,
            {
              id: createChatMessageId("a"),
              role: "assistant",
              text: assistantMessage
            }
          ]);
        } finally {
          window.clearTimeout(timeoutId);
          setIsAiSubmitting(false);
        }
      })();
    },
    [boardId, chatInput, isAiSubmitting, user]
  );

  const handleStagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
        mode: isRemoveMarquee ? "remove" : "add"
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
      initialY: viewportRef.current.y
    };
  }, [toBoardCoordinates]);

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const now = Date.now();
      if (now - sendCursorAtRef.current < CURSOR_THROTTLE_MS) {
        return;
      }

      sendCursorAtRef.current = now;
      const nextPoint = toBoardCoordinates(event.clientX, event.clientY);
      if (!nextPoint) {
        return;
      }

      void updateCursor(nextPoint);
    },
    [toBoardCoordinates, updateCursor]
  );

  const handleStagePointerLeave = useCallback(() => {
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
        scale: nextScale
      });
    },
    []
  );

  const zoomAtPointer = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const effectiveDeltaY = getAcceleratedWheelZoomDelta(deltaY);
    const zoomFactor = Math.exp(-effectiveDeltaY * ZOOM_WHEEL_INTENSITY);
    const nextScale = clampScale(viewportRef.current.scale * zoomFactor);
    setScaleAtClientPoint(clientX, clientY, nextScale);
  }, [setScaleAtClientPoint]);

  const zoomAtStageCenter = useCallback((targetScale: number) => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const rect = stageElement.getBoundingClientRect();
    setScaleAtClientPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      targetScale
    );
  }, [setScaleAtClientPoint]);

  const nudgeZoom = useCallback((direction: "in" | "out") => {
    const deltaPercent = direction === "in" ? ZOOM_BUTTON_STEP_PERCENT : -ZOOM_BUTTON_STEP_PERCENT;
    const nextPercent = Math.round(viewportRef.current.scale * 100) + deltaPercent;
    zoomAtStageCenter(nextPercent / 100);
  }, [zoomAtStageCenter]);

  const panByWheel = useCallback((deltaX: number, deltaY: number) => {
    setViewport((previous) => ({
      x: previous.x - deltaX,
      y: previous.y - deltaY,
      scale: previous.scale
    }));
  }, []);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.ctrlKey || event.metaKey) {
        zoomAtPointer(event.clientX, event.clientY, event.deltaY);
        return;
      }

      panByWheel(event.deltaX, event.deltaY);
    };

    stageElement.addEventListener("wheel", handleNativeWheel, { passive: false });

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

      const currentSelectedIds = selectedObjectIdsRef.current;
      const shouldPrepareGroupDrag =
        currentSelectedIds.has(objectId) && currentSelectedIds.size > 1;
      const dragObjectIds = shouldPrepareGroupDrag
        ? Array.from(currentSelectedIds)
        : [objectId];

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

      dragStateRef.current = {
        objectIds: availableObjectIds,
        initialGeometries,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastSentAt: 0,
        hasMoved: false,
        collapseToObjectIdOnClick: shouldPrepareGroupDrag ? objectId : null
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject, toggleObjectSelection]
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
      if (!objectItem || objectItem.type === "line") {
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
        y: geometry.y + geometry.height / 2
      };
      const initialPointerAngleDeg = toDegrees(
        Math.atan2(pointer.y - centerPoint.y, pointer.x - centerPoint.x)
      );

      selectSingleObject(objectId);
      rotateStateRef.current = {
        objectId,
        centerPoint,
        initialPointerAngleDeg,
        initialRotationDeg: geometry.rotationDeg,
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject, toBoardCoordinates]
  );

  const startCornerResize = useCallback(
    (objectId: string, corner: ResizeCorner, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type === "line") {
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
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject]
  );

  const startLineEndpointResize = useCallback(
    (
      objectId: string,
      endpoint: LineEndpoint,
      event: ReactPointerEvent<HTMLButtonElement>
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
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry, selectSingleObject]
  );

  const onlineUsers = useMemo(
    () =>
      presenceUsers
        .filter((presenceUser) => {
          if (!presenceUser.active) {
            return false;
          }

          if (!presenceUser.lastSeenAt) {
            return false;
          }

          return presenceClock - presenceUser.lastSeenAt <= PRESENCE_TTL_MS;
        })
        .sort((left, right) => getPresenceLabel(left).localeCompare(getPresenceLabel(right))),
    [presenceClock, presenceUsers]
  );

  const remoteCursors = useMemo(
    () =>
      onlineUsers.filter(
        (presenceUser) =>
          presenceUser.uid !== user.uid &&
          presenceUser.cursorX !== null &&
          presenceUser.cursorY !== null
      ),
    [onlineUsers, user.uid]
  );

  const selectedObjectCount = selectedObjectIds.length;
  const selectedObjects = useMemo(
    () =>
      selectedObjectIds
        .map((objectId) => {
          const objectItem = objects.find((candidate) => candidate.id === objectId);
          if (!objectItem) {
            return null;
          }

          const draftGeometry = draftGeometryById[objectId];
          const geometry: ObjectGeometry = draftGeometry ?? {
            x: objectItem.x,
            y: objectItem.y,
            width: objectItem.width,
            height: objectItem.height,
            rotationDeg: objectItem.rotationDeg
          };

          return {
            object: objectItem,
            geometry
          };
        })
        .filter(
          (
            item
          ): item is {
            object: BoardObject;
            geometry: ObjectGeometry;
          } => item !== null
        ),
    [draftGeometryById, objects, selectedObjectIds]
  );
  const selectedObjectBounds = useMemo(
    () =>
      mergeBounds(
        selectedObjects.map((selectedObject) =>
          getObjectVisualBounds(selectedObject.object.type, selectedObject.geometry)
        )
      ),
    [selectedObjects]
  );
  const selectedColor = useMemo(() => {
    if (selectedObjects.length === 0) {
      return null;
    }

    const firstColor = selectedObjects[0].object.color.toLowerCase();
    const hasMixedColors = selectedObjects.some(
      (selectedObject) => selectedObject.object.color.toLowerCase() !== firstColor
    );

    return hasMixedColors ? null : selectedObjects[0].object.color;
  }, [selectedObjects]);
  const canColorSelection = canEdit && selectedObjects.length > 0;
  const canResetSelectionRotation =
    canEdit &&
    selectedObjects.some((selectedObject) =>
      hasMeaningfulRotation(selectedObject.geometry.rotationDeg)
    );
  const canShowSelectionHud = canColorSelection;
  const selectionHudPosition = useMemo(() => {
    if (!canShowSelectionHud || !selectedObjectBounds) {
      return null;
    }

    if (stageSize.width <= 0 || stageSize.height <= 0) {
      return null;
    }

    const hudWidth = selectionHudSize.width > 0 ? selectionHudSize.width : 214;
    const hudHeight = selectionHudSize.height > 0 ? selectionHudSize.height : 86;
    const edgePadding = 10;
    const offset = 10;
    const selectionLeft = viewport.x + selectedObjectBounds.left * viewport.scale;
    const selectionRight = viewport.x + selectedObjectBounds.right * viewport.scale;
    const selectionTop = viewport.y + selectedObjectBounds.top * viewport.scale;
    const selectionBottom = viewport.y + selectedObjectBounds.bottom * viewport.scale;
    const selectionCenterY = (selectionTop + selectionBottom) / 2;
    const maxX = Math.max(edgePadding, stageSize.width - hudWidth - edgePadding);
    const maxY = Math.max(edgePadding, stageSize.height - hudHeight - edgePadding);

    const clampPoint = (point: { x: number; y: number }) => ({
      x: Math.max(edgePadding, Math.min(maxX, point.x)),
      y: Math.max(edgePadding, Math.min(maxY, point.y))
    });

    const isFullyVisible = (point: { x: number; y: number }) =>
      point.x >= edgePadding &&
      point.y >= edgePadding &&
      point.x + hudWidth <= stageSize.width - edgePadding &&
      point.y + hudHeight <= stageSize.height - edgePadding;

    const singleSelectedObject =
      selectedObjects.length === 1 ? selectedObjects[0].object : null;
    const preferSidePlacement =
      singleSelectedObject !== null && singleSelectedObject.type !== "line";

    const candidates = preferSidePlacement
      ? [
          { x: selectionRight + offset, y: selectionCenterY - hudHeight / 2 },
          { x: selectionLeft - hudWidth - offset, y: selectionCenterY - hudHeight / 2 },
          { x: selectionRight - hudWidth, y: selectionBottom + offset },
          { x: selectionRight - hudWidth, y: selectionTop - hudHeight - offset }
        ]
      : [
          { x: selectionRight - hudWidth, y: selectionTop - hudHeight - offset },
          { x: selectionRight - hudWidth, y: selectionBottom + offset },
          { x: selectionRight + offset, y: selectionCenterY - hudHeight / 2 },
          { x: selectionLeft - hudWidth - offset, y: selectionCenterY - hudHeight / 2 }
        ];

    const visibleCandidate = candidates.find((candidate) => isFullyVisible(candidate));
    if (visibleCandidate) {
      return visibleCandidate;
    }

    return clampPoint(candidates[0] ?? { x: edgePadding, y: edgePadding });
  }, [
    canShowSelectionHud,
    selectedObjectBounds,
    selectedObjects,
    selectionHudSize,
    stageSize,
    viewport
  ]);
  const hasDeletableSelection = useMemo(
    () =>
      canEdit &&
      selectedObjectIds.length > 0 &&
      objects.some((item) => selectedObjectIds.includes(item.id)),
    [canEdit, objects, selectedObjectIds]
  );

  useEffect(() => {
    if (!canShowSelectionHud) {
      setSelectionHudSize((previous) =>
        previous.width === 0 && previous.height === 0
          ? previous
          : { width: 0, height: 0 }
      );
      return;
    }

    const hudElement = selectionHudRef.current;
    if (!hudElement) {
      return;
    }

    const syncHudSize = () => {
      const nextWidth = hudElement.offsetWidth;
      const nextHeight = hudElement.offsetHeight;
      setSelectionHudSize((previous) =>
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight }
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
  }, [canResetSelectionRotation, canShowSelectionHud, selectedColor]);

  const zoomPercent = Math.round(viewport.scale * 100);
  const zoomSliderValue = Math.min(
    ZOOM_SLIDER_MAX_PERCENT,
    Math.max(ZOOM_SLIDER_MIN_PERCENT, zoomPercent)
  );
  const marqueeRect = marqueeSelectionState
    ? toNormalizedRect(
        marqueeSelectionState.startPoint,
        marqueeSelectionState.currentPoint
      )
    : null;

  return (
    <section
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "white"
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `${isLeftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH}px ${PANEL_SEPARATOR_WIDTH}px minmax(0, 1fr) ${PANEL_SEPARATOR_WIDTH}px ${isRightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH}px`
        }}
      >
        <aside
          style={{
            minWidth: 0,
            minHeight: 0,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          {isLeftPanelCollapsed ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                padding: "0.45rem 0.2rem",
                gap: "0.55rem"
              }}
            >
              <button
                type="button"
                onClick={() => setIsLeftPanelCollapsed(false)}
                title="Expand tools panel"
                aria-label="Expand tools panel"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "2px solid #334155",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {">"}
              </button>
              <span
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  color: "#334155",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em"
                }}
              >
                TOOLS
              </span>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "0.6rem 0.7rem",
                  borderBottom: "1px solid #dbe3eb",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "0.45rem"
                }}
              >
                <strong style={{ fontSize: 13, color: "#111827", lineHeight: 1.2 }}>
                  Tools
                </strong>
                <button
                  type="button"
                  onClick={() => setIsLeftPanelCollapsed(true)}
                  title="Collapse tools panel"
                  aria-label="Collapse tools panel"
                  style={{
                    width: 36,
                    height: 36,
                    border: "2px solid #334155",
                    borderRadius: 10,
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontWeight: 700,
                    alignSelf: "flex-end",
                    cursor: "pointer"
                  }}
                >
                  {"<"}
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
                  alignContent: "start"
                }}
              >
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 42px)",
                    justifyContent: "center",
                    gap: "0.45rem",
                    overflow: "visible"
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
                        border: "1px solid #d1d5db",
                        borderRadius: 10,
                        background: "white",
                        height: 42,
                        padding: 0,
                        lineHeight: 0,
                        overflow: "visible"
                      }}
                    >
                      <ToolIcon kind={toolKind} />
                    </button>
                  ))}
                </div>

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
                      background: "#fef2f2",
                      color: "#7f1d1d",
                      height: 34,
                      fontSize: 12
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
                    border: "1px solid #cbd5e1",
                    background: "white",
                    fontSize: 12
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
                    border: "1px solid #d1d5db",
                    borderRadius: 10,
                    background: "white"
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
                      border: "1px solid #d1d5db",
                      background: "#f8fafc",
                      lineHeight: 1,
                      padding: 0
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
                      accentColor: "#2563eb"
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
                      border: "1px solid #d1d5db",
                      background: "#f8fafc",
                      lineHeight: 1,
                      padding: 0
                    }}
                  >
                    +
                  </button>
                  <span
                    style={{
                      color: "#6b7280",
                      fontSize: 11,
                      minWidth: 34,
                      textAlign: "right",
                      fontVariantNumeric: "tabular-nums"
                    }}
                  >
                    {zoomPercent}%
                  </span>
                </div>

                <span
                  style={{
                    color: selectedObjectCount > 0 ? "#111827" : "#6b7280",
                    fontSize: 12,
                    lineHeight: 1.25,
                    wordBreak: "break-word"
                  }}
                >
                  Selected:{" "}
                  {selectedObjectCount > 0
                    ? `${selectedObjectCount} object${selectedObjectCount === 1 ? "" : "s"}`
                    : "None"}
                </span>

                {boardError ? (
                  <p style={{ color: "#b91c1c", margin: 0, fontSize: 13 }}>{boardError}</p>
                ) : null}
              </div>
            </>
          )}
        </aside>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)"
          }}
        />

        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative"
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
              backgroundColor: "#f9fafb",
              backgroundImage:
                "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
              backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
              backgroundPosition: `${viewport.x}px ${viewport.y}px`,
              touchAction: "none",
              overscrollBehavior: "contain"
            }}
          >

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
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0.4rem 0.45rem",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                background: "rgba(255,255,255,0.98)",
                boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
                backdropFilter: "blur(2px)"
              }}
            >
              <ColorSwatchPicker
                currentColor={selectedColor}
                onSelectColor={(nextColor) => {
                  void saveSelectedObjectsColor(nextColor);
                }}
              />
              {canResetSelectionRotation ? (
                <button
                  type="button"
                  onClick={() => {
                    void resetSelectedObjectsRotation();
                  }}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: 8,
                    background: "white",
                    padding: "0.35rem 0.55rem",
                    color: "#1f2937",
                    fontSize: 12,
                    whiteSpace: "nowrap"
                  }}
                >
                  Reset rotation
                </button>
              ) : null}
            </div>
          ) : null}

          <div
            style={{
              position: "absolute",
              inset: 0,
              transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
              transformOrigin: "0 0"
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
              const isSelected = selectedObjectIds.includes(objectItem.id);
              const isSingleSelected = selectedObjectIds.length === 1 && isSelected;
              const objectGeometry: ObjectGeometry = {
                x: objectX,
                y: objectY,
                width: objectWidth,
                height: objectHeight,
                rotationDeg: objectRotationDeg
              };
              const lineEndpointOffsets =
                objectItem.type === "line" ? getLineEndpointOffsets(objectGeometry) : null;
              const isPolygonShape =
                objectItem.type === "triangle" || objectItem.type === "star";

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
                      borderRadius: 10,
                      border: isSelected
                        ? "2px solid #2563eb"
                        : "1px solid rgba(15, 23, 42, 0.28)",
                      background: objectItem.color,
                      boxShadow: isSelected
                        ? SELECTED_OBJECT_HALO
                        : "0 4px 12px rgba(0,0,0,0.08)",
                      overflow: "visible",
                      transform: `rotate(${objectRotationDeg}deg)`,
                      transformOrigin: "center center",
                      transition: hasDraftGeometry
                        ? "none"
                        : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear"
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: 8,
                        overflow: "hidden"
                      }}
                    >
                      <header
                        onPointerDown={(event) => startObjectDrag(objectItem.id, event)}
                        style={{
                          height: 28,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "flex-start",
                          gap: "0.35rem",
                          padding: "0 0.5rem",
                          background: "rgba(0,0,0,0.08)",
                          cursor: canEdit ? "grab" : "default"
                        }}
                      />

                      <textarea
                        value={objectText}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          selectSingleObject(objectItem.id);
                        }}
                        onFocus={() => selectSingleObject(objectItem.id)}
                        onChange={(event) => {
                          const nextText = event.target.value.slice(0, 1_000);
                          setTextDrafts((previous) => ({
                            ...previous,
                            [objectItem.id]: nextText
                          }));
                          queueStickyTextSync(objectItem.id, nextText);
                        }}
                        onBlur={(event) => {
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
                          color: "#111827",
                          fontSize: 14,
                          outline: "none"
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
                              background: "white",
                              cursor: getCornerCursor(corner)
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
                            pointerEvents: "none"
                          }}
                        />
                        <button
                          type="button"
                          onPointerDown={(event) => startShapeRotate(objectItem.id, event)}
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
                            background: "white",
                            boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
                            cursor: "grab"
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
                            objectItem.type === "triangle" ||
                            objectItem.type === "star"
                          ? 0
                          : 4,
                    transform:
                      objectItem.type === "line"
                        ? "none"
                        : `rotate(${objectRotationDeg}deg)`,
                    transformOrigin: "center center",
                    transition: hasDraftGeometry
                      ? "none"
                      : "left 55ms linear, top 55ms linear, width 55ms linear, height 55ms linear, transform 55ms linear"
                  }}
                >
                  <div
                    onPointerDown={(event) => startObjectDrag(objectItem.id, event)}
                    style={{
                      width: "100%",
                      height: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: canEdit ? "grab" : "default",
                      border:
                        objectItem.type === "line" || isPolygonShape
                          ? "none"
                          : "2px solid rgba(15, 23, 42, 0.55)",
                      borderRadius:
                        objectItem.type === "rect"
                          ? 3
                          : objectItem.type === "circle"
                            ? "999px"
                            : 0,
                      background:
                        objectItem.type === "line" || isPolygonShape
                          ? "transparent"
                          : objectItem.color,
                      boxShadow:
                        objectItem.type === "line" || isPolygonShape
                          ? "none"
                          : "0 3px 10px rgba(0,0,0,0.08)"
                    }}
                  >
                    {objectItem.type === "line" ? (
                      <div
                        style={{
                          width: "100%",
                          height: 4,
                          borderRadius: 999,
                          background: objectItem.color,
                          transform: `rotate(${objectRotationDeg}deg)`,
                          transformOrigin: "center center"
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
                          fill={objectItem.color}
                          stroke="rgba(15, 23, 42, 0.62)"
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
                          fill={objectItem.color}
                          stroke="rgba(15, 23, 42, 0.62)"
                          strokeWidth="5"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : null}
                  </div>

                  {isSingleSelected && canEdit && objectItem.type !== "line" ? (
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
                          pointerEvents: "none"
                        }}
                      />
                      <button
                        type="button"
                        onPointerDown={(event) => startShapeRotate(objectItem.id, event)}
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
                          background: "white",
                          boxShadow: "0 1px 4px rgba(15, 23, 42, 0.25)",
                          cursor: "grab"
                        }}
                      />
                    </>
                  ) : null}

                  {isSingleSelected && canEdit && objectItem.type !== "line" ? (
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
                            background: "white",
                            cursor: getCornerCursor(corner)
                          }}
                          aria-label={`Resize ${corner} corner`}
                        />
                      ))}
                    </div>
                  ) : null}

                  {isSingleSelected && canEdit && objectItem.type === "line" && lineEndpointOffsets ? (
                    <>
                      <button
                        type="button"
                        onPointerDown={(event) =>
                          startLineEndpointResize(objectItem.id, "start", event)
                        }
                        aria-label="Adjust line start"
                        style={{
                          position: "absolute",
                          left: lineEndpointOffsets.start.x - RESIZE_HANDLE_SIZE / 2,
                          top: lineEndpointOffsets.start.y - RESIZE_HANDLE_SIZE / 2,
                          width: RESIZE_HANDLE_SIZE,
                          height: RESIZE_HANDLE_SIZE,
                          borderRadius: "50%",
                          border: "1px solid #1d4ed8",
                          background: "white",
                          cursor: "move"
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
                          left: lineEndpointOffsets.end.x - RESIZE_HANDLE_SIZE / 2,
                          top: lineEndpointOffsets.end.y - RESIZE_HANDLE_SIZE / 2,
                          width: RESIZE_HANDLE_SIZE,
                          height: RESIZE_HANDLE_SIZE,
                          borderRadius: "50%",
                          border: "1px solid #1d4ed8",
                          background: "white",
                          cursor: "move"
                        }}
                      />
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>

          {marqueeRect ? (
            <div
              style={{
                position: "absolute",
                left: viewport.x + marqueeRect.left * viewport.scale,
                top: viewport.y + marqueeRect.top * viewport.scale,
                width: Math.max(1, (marqueeRect.right - marqueeRect.left) * viewport.scale),
                height: Math.max(1, (marqueeRect.bottom - marqueeRect.top) * viewport.scale),
                border: "1px solid rgba(37, 99, 235, 0.95)",
                background: "rgba(59, 130, 246, 0.16)",
                pointerEvents: "none",
                zIndex: 40
              }}
            />
          ) : null}

          {remoteCursors.map((presenceUser) => (
            <div
              key={presenceUser.uid}
              style={{
                position: "absolute",
                left: viewport.x + (presenceUser.cursorX ?? 0) * viewport.scale,
                top: viewport.y + (presenceUser.cursorY ?? 0) * viewport.scale,
                pointerEvents: "none",
                transform: "translate(-2px, -2px)"
              }}
            >
              <svg
                width="18"
                height="24"
                viewBox="0 0 18 24"
                style={{
                  display: "block",
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))"
                }}
                aria-hidden="true"
              >
                <path
                  d="M2 1.5 L2 18.8 L6.6 14.9 L9.2 22 L12 20.8 L9.5 13.8 L16.2 13.8 Z"
                  fill={presenceUser.color}
                  stroke="white"
                  strokeWidth="1.15"
                  strokeLinejoin="round"
                />
              </svg>
              <div
                style={{
                  marginTop: 2,
                  marginLeft: 10,
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: presenceUser.color,
                  color: "white",
                  fontSize: 11,
                  whiteSpace: "nowrap"
                }}
              >
                {getPresenceLabel(presenceUser)}
              </div>
            </div>
          ))}
        </div>
      </div>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)"
          }}
        />

        <aside
          style={{
            minWidth: 0,
            minHeight: 0,
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden"
          }}
        >
          {isRightPanelCollapsed ? (
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "flex-start",
                padding: "0.45rem 0.2rem",
                gap: "0.55rem"
              }}
            >
              <button
                type="button"
                onClick={() => setIsRightPanelCollapsed(false)}
                title="Expand online users panel"
                aria-label="Expand online users panel"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: "2px solid #334155",
                  background: "#e2e8f0",
                  color: "#0f172a",
                  fontWeight: 700,
                  cursor: "pointer"
                }}
              >
                {"<"}
              </button>
              <span
                style={{
                  writingMode: "vertical-rl",
                  transform: "rotate(180deg)",
                  color: "#334155",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: "0.04em"
                }}
              >
                ONLINE USERS
              </span>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: "0.6rem 0.7rem",
                  borderBottom: "1px solid #dbe3eb",
                  display: "grid",
                  gap: "0.45rem"
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.55rem"
                  }}
                >
                  <strong style={{ fontSize: 13, color: "#111827", lineHeight: 1.2 }}>
                    Online users
                  </strong>
                  <span style={{ color: "#6b7280", fontSize: 13 }}>{onlineUsers.length}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRightPanelCollapsed(true)}
                  title="Collapse online users panel"
                  aria-label="Collapse online users panel"
                  style={{
                    width: 36,
                    height: 36,
                    border: "2px solid #334155",
                    borderRadius: 10,
                    background: "#e2e8f0",
                    color: "#0f172a",
                    fontWeight: 700,
                    justifySelf: "start",
                    cursor: "pointer"
                  }}
                >
                  {">"}
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
                  color: "#374151"
                }}
              >
                {onlineUsers.length > 0 ? (
                  onlineUsers.map((presenceUser) => (
                    <span
                      key={presenceUser.uid}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis"
                      }}
                      title={getPresenceLabel(presenceUser)}
                    >
                      <span style={{ color: presenceUser.color }}>●</span>
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis"
                        }}
                      >
                        {getPresenceLabel(presenceUser)}
                      </span>
                    </span>
                  ))
                ) : (
                  <span style={{ color: "#6b7280" }}>No active users yet.</span>
                )}
              </div>
            </>
          )}
        </aside>
      </div>

      <footer
        style={{
          height: isAiFooterCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : aiFooterHeight,
          minHeight: isAiFooterCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : aiFooterHeight,
          maxHeight: isAiFooterCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : aiFooterHeight,
          borderTop: `${PANEL_SEPARATOR_WIDTH}px solid ${PANEL_SEPARATOR_COLOR}`,
          background: "#ffffff",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
          position: "relative"
        }}
      >
        <button
          type="button"
          onClick={() => setIsAiFooterCollapsed((previous) => !previous)}
          aria-label={isAiFooterCollapsed ? "Expand AI assistant drawer" : "Collapse AI assistant drawer"}
          title={isAiFooterCollapsed ? "Expand AI assistant drawer" : "Collapse AI assistant drawer"}
          style={{
            position: "absolute",
            right: "clamp(0.8rem, 2vw, 1.5rem)",
            top: 0,
            height: 28,
            minWidth: 120,
            border: "1px solid #64748b",
            borderTop: "none",
            borderRadius: "0 0 12px 12px",
            background: "#dbe5f1",
            color: "#0f172a",
            fontWeight: 700,
            fontSize: 15,
            lineHeight: 1,
            cursor: "pointer",
            zIndex: 8
          }}
        >
          {isAiFooterCollapsed ? "↑" : "↓"}
        </button>

        {isAiFooterCollapsed ? (
          <div
            style={{
              height: "100%",
              display: "grid",
              alignItems: "stretch",
              padding: "0 clamp(0.8rem, 2vw, 1.5rem)"
            }}
          >
            <div
              style={{
                width: "min(100%, 800px)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-start",
                gap: "0.75rem"
              }}
            >
              <strong style={{ fontSize: 13, color: "#0f172a" }}>AI Assistant</strong>
            </div>
          </div>
        ) : (
          <>
            <div
              onPointerDown={handleAiFooterResizeStart}
              style={{
                height: 18,
                borderBottom: "1px solid #e2e8f0",
                cursor: "ns-resize",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "#f8fafc",
                touchAction: "none",
                paddingRight: 128
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 3,
                  borderRadius: 999,
                  background: "#cbd5e1"
                }}
              />
            </div>

            <div
              style={{
                display: "grid",
                padding: "0.45rem clamp(0.8rem, 2vw, 1.5rem)",
                borderBottom: "1px solid #e5e7eb",
                gap: "0.5rem"
              }}
            >
              <div
                style={{
                width: "min(100%, 800px)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem"
              }}
            >
              <strong style={{ fontSize: 13, color: "#0f172a" }}>AI Assistant</strong>
            </div>
            </div>

            <div
              style={{
                flex: 1,
                minHeight: 0,
                padding: "0.6rem clamp(0.8rem, 2vw, 1.5rem)",
                background: "#f8fafc",
                overflow: "hidden"
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
                  gap: "0.5rem"
                }}
              >
                {chatMessages.length === 0 ? (
                  <span style={{ color: "#64748b", fontSize: 13 }}>
                    Ask the board assistant something. It will reply with a stub for now.
                  </span>
                ) : (
                  chatMessages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                        maxWidth: "min(520px, 92%)",
                        padding: "0.42rem 0.58rem",
                        borderRadius: 8,
                        background: message.role === "user" ? "#dbeafe" : "#e2e8f0",
                        color: "#0f172a",
                        fontSize: 13,
                        lineHeight: 1.35
                      }}
                    >
                      {message.text}
                    </div>
                  ))
                )}
              </div>
            </div>

            <form
              onSubmit={handleAiChatSubmit}
              style={{
                display: "grid",
                padding: "0.55rem clamp(0.8rem, 2vw, 1.5rem)",
                borderTop: "1px solid #e5e7eb"
              }}
            >
              <div
                style={{
                  width: "min(100%, 800px)",
                  margin: "0 auto",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center"
                }}
              >
                <input
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  disabled={isAiSubmitting}
                  placeholder="Ask AI agent..."
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: "0.48rem 0.58rem"
                  }}
                />
                <button
                  type="submit"
                  disabled={isAiSubmitting || chatInput.trim().length === 0}
                >
                  {isAiSubmitting ? "Sending..." : "Send"}
                </button>
              </div>
            </form>
          </>
        )}
      </footer>
    </section>
  );
}
