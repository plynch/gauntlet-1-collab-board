export type ContainerBoardPoint = {
  x: number;
  y: number;
};

export type ContainerObjectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ContainerObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SectionSize = {
  width: number;
  height: number;
};

const DEFAULT_SECTION_PADDING = 8;

/**
 * Handles clamp to range.
 */
export function clampToRange(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

/**
 * Gets section bounds center.
 */
export function getSectionBoundsCenter(
  bounds: ContainerObjectBounds,
): ContainerBoardPoint {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

/**
 * Gets grid section bounds from geometry.
 */
export function getGridSectionBoundsFromGeometry(
  containerGeometry: ContainerObjectGeometry,
  rows: number,
  cols: number,
  gap: number,
  options: { padding?: number } = {},
): ContainerObjectBounds[] {
  const padding = options.padding ?? DEFAULT_SECTION_PADDING;
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const safeGap = Math.max(0, gap);
  const innerWidth = Math.max(
    1,
    containerGeometry.width - padding * 2 - safeGap * (safeCols - 1),
  );
  const innerHeight = Math.max(
    1,
    containerGeometry.height - padding * 2 - safeGap * (safeRows - 1),
  );
  const cellWidth = innerWidth / safeCols;
  const cellHeight = innerHeight / safeRows;
  const sections: ContainerObjectBounds[] = [];

  for (let row = 0; row < safeRows; row += 1) {
    for (let col = 0; col < safeCols; col += 1) {
      const left = containerGeometry.x + padding + col * (cellWidth + safeGap);
      const top = containerGeometry.y + padding + row * (cellHeight + safeGap);
      sections.push({
        left,
        right: left + cellWidth,
        top,
        bottom: top + cellHeight,
      });
    }
  }

  return sections;
}

/**
 * Gets closest section index.
 */
export function getClosestSectionIndex(
  point: ContainerBoardPoint,
  sections: ContainerObjectBounds[],
): number | null {
  if (sections.length === 0) {
    return null;
  }

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  sections.forEach((section, index) => {
    const center = getSectionBoundsCenter(section);
    const distance = Math.hypot(center.x - point.x, center.y - point.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

/**
 * Handles to section relative coordinate.
 */
export function toSectionRelativeCoordinate(
  center: ContainerBoardPoint,
  section: ContainerObjectBounds,
): { x: number; y: number } {
  const sectionWidth = Math.max(1, section.right - section.left);
  const sectionHeight = Math.max(1, section.bottom - section.top);
  return {
    x: clampToRange((center.x - section.left) / sectionWidth, 0, 1),
    y: clampToRange((center.y - section.top) / sectionHeight, 0, 1),
  };
}

/**
 * Handles clamp object top left to section.
 */
export function clampObjectTopLeftToSection(
  section: ContainerObjectBounds,
  objectSize: SectionSize,
  preferredTopLeft: ContainerBoardPoint,
): ContainerBoardPoint {
  const sectionWidth = Math.max(1, section.right - section.left);
  const sectionHeight = Math.max(1, section.bottom - section.top);
  const maxX = section.right - objectSize.width;
  const maxY = section.bottom - objectSize.height;

  const x =
    maxX < section.left
      ? section.left + (sectionWidth - objectSize.width) / 2
      : clampToRange(preferredTopLeft.x, section.left, maxX);
  const y =
    maxY < section.top
      ? section.top + (sectionHeight - objectSize.height) / 2
      : clampToRange(preferredTopLeft.y, section.top, maxY);

  return { x, y };
}
