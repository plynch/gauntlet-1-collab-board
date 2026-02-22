export const DEFAULT_SWOT_SECTION_TITLES = [
  "Strengths",
  "Weaknesses",
  "Opportunities",
  "Threats",
] as const;

export function getDefaultSectionTitles(rows: number, cols: number): string[] {
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

export function normalizeSectionValues(
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
