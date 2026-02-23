import { Timestamp } from "firebase-admin/firestore";

export function toNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function toNullableFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toGridDimension(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Math.floor(toNumber(value, fallback));
  return Math.max(minimum, Math.min(maximum, parsed));
}

export function toGridCellColors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const colors = value.filter(
    (item): item is string => typeof item === "string",
  );
  return colors.length > 0 ? colors : null;
}

export function toStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const values = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim());

  return values.length > 0 ? values : null;
}

export function toOptionalString(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.slice(0, maxLength);
}

export function normalizeSectionValues(
  values: string[] | null,
  expectedCount: number,
  fallback: (index: number) => string,
  maxLength: number,
): string[] {
  return Array.from({ length: expectedCount }, (_, index) => {
    const candidate = values?.[index]?.trim() ?? "";
    if (candidate.length === 0) {
      return fallback(index).slice(0, maxLength);
    }
    return candidate.slice(0, maxLength);
  });
}

export function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  return null;
}
