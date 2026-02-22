import { Timestamp } from "firebase/firestore";

import type {
  BoardObject,
  BoardObjectKind,
  ConnectorAnchor,
  PresenceUser,
} from "@/features/boards/types";
import {
  getDefaultObjectColor,
  getDefaultObjectSize,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";

type BoardObjectParserOptions = {
  gridContainerMaxRows: number;
  gridContainerMaxCols: number;
  gridContainerDefaultGap: number;
};

export function hashToColor(input: string): string {
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

export function toBoardObject(
  rawId: string,
  rawData: Record<string, unknown>,
  options: BoardObjectParserOptions,
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
    text: getString(
      rawData.text,
      type === "sticky" ? "New sticky note" : type === "text" ? "Text" : "",
    ),
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
      options.gridContainerMaxRows,
      options.gridContainerMaxCols,
    ),
    gridCols: getGridDimension(
      rawData.gridCols,
      type === "gridContainer" ? 2 : null,
      options.gridContainerMaxRows,
      options.gridContainerMaxCols,
    ),
    gridGap: getGridGap(
      rawData.gridGap,
      type === "gridContainer" ? options.gridContainerDefaultGap : null,
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

export function toPresenceUser(
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

function isBoardObjectKind(value: unknown): value is BoardObjectKind {
  return (
    value === "sticky" ||
    value === "text" ||
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

function getGridDimension(
  value: unknown,
  fallback: number | null,
  gridContainerMaxRows: number,
  gridContainerMaxCols: number,
): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      Math.max(gridContainerMaxRows, gridContainerMaxCols),
      Math.floor(value),
    ),
  );
}

function getGridGap(value: unknown, fallback: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(24, Math.round(value)));
}

function getNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const floored = Math.floor(value);
  return floored >= 0 ? floored : null;
}

function getGridCellColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const colors = value.filter(
    (item): item is string => typeof item === "string",
  );
  return colors.length > 0 ? colors : null;
}

function getStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());
  return values.length > 0 ? values : null;
}

function getTimestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}
