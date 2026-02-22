import {
  clampObjectTopLeftToSection,
  clampToRange,
  getClosestSectionIndex,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
  type ContainerBoardPoint,
  type ContainerObjectBounds,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";

export type LabState = {
  objectX: number;
  objectY: number;
  sectionIndex: number | null;
  relX: number;
  relY: number;
};

export const STAGE_WIDTH = 980;
export const STAGE_HEIGHT = 700;
export const STAGE_PADDING = 12;
export const CONTAINER_GAP = 2;
export const CONTAINER_GEOMETRY = {
  x: 140,
  y: 110,
  width: 620,
  height: 420,
};
export const OBJECT_SIZE = {
  width: 108,
  height: 72,
};

export function pointInsideBounds(
  point: ContainerBoardPoint,
  bounds: ContainerObjectBounds,
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

export function getContainerBounds(): ContainerObjectBounds {
  return {
    left: CONTAINER_GEOMETRY.x,
    right: CONTAINER_GEOMETRY.x + CONTAINER_GEOMETRY.width,
    top: CONTAINER_GEOMETRY.y,
    bottom: CONTAINER_GEOMETRY.y + CONTAINER_GEOMETRY.height,
  };
}

export function getObjectCenterFromState(state: LabState): ContainerBoardPoint {
  return {
    x: state.objectX + OBJECT_SIZE.width / 2,
    y: state.objectY + OBJECT_SIZE.height / 2,
  };
}

export function getSectionIndexForCenter(
  center: ContainerBoardPoint,
  sections: ContainerObjectBounds[],
): number | null {
  const containingSectionIndex = sections.findIndex((section) =>
    pointInsideBounds(center, section),
  );
  if (containingSectionIndex >= 0) {
    return containingSectionIndex;
  }

  return getClosestSectionIndex(center, sections);
}

export function snapStateToDimensions(
  state: LabState,
  rows: number,
  cols: number,
): LabState {
  if (state.sectionIndex === null) {
    return state;
  }

  const sections = getGridSectionBoundsFromGeometry(
    CONTAINER_GEOMETRY,
    rows,
    cols,
    CONTAINER_GAP,
  );
  if (sections.length === 0) {
    return { ...state, sectionIndex: null };
  }

  const normalizedSectionIndex = clampToRange(
    state.sectionIndex,
    0,
    sections.length - 1,
  );
  const section = sections[normalizedSectionIndex];
  const sectionWidth = Math.max(1, section.right - section.left);
  const sectionHeight = Math.max(1, section.bottom - section.top);
  const relX = clampToRange(state.relX, 0, 1);
  const relY = clampToRange(state.relY, 0, 1);
  const preferredTopLeft = {
    x: section.left + relX * sectionWidth - OBJECT_SIZE.width / 2,
    y: section.top + relY * sectionHeight - OBJECT_SIZE.height / 2,
  };
  const clampedTopLeft = clampObjectTopLeftToSection(
    section,
    OBJECT_SIZE,
    preferredTopLeft,
  );
  const clampedCenter = {
    x: clampedTopLeft.x + OBJECT_SIZE.width / 2,
    y: clampedTopLeft.y + OBJECT_SIZE.height / 2,
  };
  const nextRelative = toSectionRelativeCoordinate(clampedCenter, section);

  return {
    objectX: clampedTopLeft.x,
    objectY: clampedTopLeft.y,
    sectionIndex: normalizedSectionIndex,
    relX: nextRelative.x,
    relY: nextRelative.y,
  };
}

export function buildInitialState(): LabState {
  const sections = getGridSectionBoundsFromGeometry(
    CONTAINER_GEOMETRY,
    2,
    2,
    CONTAINER_GAP,
  );
  const section = sections[0];
  const preferredTopLeft = {
    x: section.left + 24,
    y: section.top + 18,
  };
  const clampedTopLeft = clampObjectTopLeftToSection(
    section,
    OBJECT_SIZE,
    preferredTopLeft,
  );
  const center = {
    x: clampedTopLeft.x + OBJECT_SIZE.width / 2,
    y: clampedTopLeft.y + OBJECT_SIZE.height / 2,
  };
  const rel = toSectionRelativeCoordinate(center, section);

  return {
    objectX: clampedTopLeft.x,
    objectY: clampedTopLeft.y,
    sectionIndex: 0,
    relX: rel.x,
    relY: rel.y,
  };
}
