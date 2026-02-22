export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(12, Math.max(1, Math.floor(value)));
}

export function clampGridDimension(
  value: number,
  min: number,
  max: number,
): number {
  return Math.min(max, Math.max(min, clampDimension(value)));
}

export function defaultSectionTitle(index: number): string {
  return `Section ${index + 1}`;
}

export function resolveValues(
  preferred: string[] | undefined,
  fallback: string[],
  cellCount: number,
): string[] {
  return Array.from(
    { length: cellCount },
    (_, index) => preferred?.[index] ?? fallback[index] ?? "",
  );
}
