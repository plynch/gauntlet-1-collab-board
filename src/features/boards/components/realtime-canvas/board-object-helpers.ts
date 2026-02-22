import type { BoardObject, BoardObjectKind } from "@/features/boards/types";

const CONNECTOR_TYPES: readonly BoardObjectKind[] = [
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
];

export const LINE_MIN_LENGTH = 40;

export function isConnectorKind(value: BoardObjectKind): boolean {
  return CONNECTOR_TYPES.includes(value);
}

export function isConnectableShapeKind(
  value: BoardObjectKind,
): value is Exclude<
  BoardObjectKind,
  "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
> {
  return value !== "line" && !isConnectorKind(value);
}

export function getDefaultObjectSize(kind: BoardObjectKind): {
  width: number;
  height: number;
} {
  if (kind === "sticky") {
    return { width: 220, height: 170 };
  }

  if (kind === "text") {
    return { width: 260, height: 96 };
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

export function getMinimumObjectSize(kind: BoardObjectKind): {
  width: number;
  height: number;
} {
  if (kind === "sticky") {
    return { width: 140, height: 100 };
  }

  if (kind === "text") {
    return { width: 160, height: 60 };
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

export function getDefaultObjectColor(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "#fde68a";
  }

  if (kind === "text") {
    return "#0f172a";
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

function clampRgbChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

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

function rgbToHexColor(red: number, green: number, blue: number): string {
  return `#${clampRgbChannel(red).toString(16).padStart(2, "0")}${clampRgbChannel(
    green,
  )
    .toString(16)
    .padStart(2, "0")}${clampRgbChannel(blue).toString(16).padStart(2, "0")}`;
}

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

export function getReadableTextColor(backgroundColor: string): string {
  const parsed = parseHexColor(backgroundColor);
  if (!parsed) {
    return "#f8fafc";
  }

  const luminance =
    (0.299 * parsed.red + 0.587 * parsed.green + 0.114 * parsed.blue) / 255;
  return luminance > 0.6 ? "#0f172a" : "#f8fafc";
}

export function getRenderedObjectColor(
  color: string,
  type: BoardObjectKind,
  resolvedTheme: "light" | "dark",
): string {
  if (resolvedTheme === "light") {
    return color;
  }

  if (type === "text") {
    return mixHexColors(color, "#f8fafc", 0.44);
  }

  if (isConnectorKind(type) || type === "line") {
    return mixHexColors(color, "#e2e8f0", 0.35);
  }

  if (type === "gridContainer") {
    return mixHexColors(color, "#0f172a", 0.22);
  }

  return mixHexColors(color, "#0b1020", 0.34);
}

export function getObjectLabel(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "Sticky";
  }

  if (kind === "text") {
    return "Text";
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

export function isBackgroundContainerType(type: BoardObjectKind): boolean {
  return type === "gridContainer";
}

export function getRenderLayerRank(type: BoardObjectKind): number {
  return isBackgroundContainerType(type) ? 0 : 1;
}

export function canUseSelectionHudColor(objectItem: BoardObject): boolean {
  return objectItem.type !== "line";
}

export function isLabelEditableObjectType(type: BoardObjectKind): boolean {
  return (
    type === "rect" ||
    type === "circle" ||
    type === "triangle" ||
    type === "star" ||
    type === "line" ||
    isConnectorKind(type)
  );
}
