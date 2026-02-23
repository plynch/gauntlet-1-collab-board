import {
  COLOR_KEYWORD_HEX,
  STICKY_DEFAULT_COLOR,
  STICKY_PALETTE_COLORS,
} from "@/features/ai/tools/board-tools/constants";

function expandHexColor(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  const shortHexMatch = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const [r, g, b] = shortHexMatch[1].split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }

  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function parseColorRgb(value: string): { r: number; g: number; b: number } | null {
  const namedHex = COLOR_KEYWORD_HEX[value.trim().toLowerCase()];
  const hex = expandHexColor(namedHex ?? value);
  if (!hex) {
    return null;
  }

  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  return { r, g, b };
}

function isBrightYellowLike(rgb: { r: number; g: number; b: number }): boolean {
  return rgb.r >= 220 && rgb.g >= 220 && rgb.b <= 120;
}

export function toNearestStickyPaletteColor(value: unknown): string {
  if (typeof value !== "string") {
    return STICKY_DEFAULT_COLOR;
  }

  const normalized = value.trim().toLowerCase();
  const exactPaletteMatch = STICKY_PALETTE_COLORS.find(
    (paletteColor) => paletteColor === normalized,
  );
  if (exactPaletteMatch) {
    return exactPaletteMatch;
  }

  const rgb = parseColorRgb(normalized);
  if (!rgb) {
    return STICKY_DEFAULT_COLOR;
  }
  if (isBrightYellowLike(rgb)) {
    return "#fde68a";
  }

  let nearestColor = STICKY_DEFAULT_COLOR;
  let nearestDistance = Number.POSITIVE_INFINITY;

  STICKY_PALETTE_COLORS.forEach((paletteColor) => {
    const paletteRgb = parseColorRgb(paletteColor);
    if (!paletteRgb) {
      return;
    }
    const distance =
      (rgb.r - paletteRgb.r) ** 2 +
      (rgb.g - paletteRgb.g) ** 2 +
      (rgb.b - paletteRgb.b) ** 2;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestColor = paletteColor;
    }
  });

  return nearestColor;
}
