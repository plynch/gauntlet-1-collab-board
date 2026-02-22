import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  clampObjectTopLeftToSection,
  clampToRange,
  getClosestSectionIndex,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import {
  getObjectCenterForPlacement,
  isContainerChildEligible,
  isPointInsideBounds,
} from "@/features/boards/components/realtime-canvas/use-container-membership-helpers";
import type {
  ContainerMembershipPatch,
  MembershipBoardPoint,
  MembershipObjectBounds,
  MembershipObjectGeometry,
} from "@/features/boards/components/realtime-canvas/use-container-membership";

type GetSectionAnchoredUpdatesInput = {
  containerId: string;
  containerGeometry: MembershipObjectGeometry;
  rows: number;
  cols: number;
  gap: number;
  objectEntries: Iterable<[string, BoardObject]>;
  getCurrentObjectGeometry: (objectId: string) => MembershipObjectGeometry | null;
  isConnectorKind: (value: BoardObjectKind) => boolean;
  maxRows: number;
  maxCols: number;
  roundToStep: (value: number, step: number) => number;
  options?: {
    clampToSectionBounds?: boolean;
    includeObjectsInNextBounds?: boolean;
  };
};

export function getSectionAnchoredObjectUpdatesForContainer(
  input: GetSectionAnchoredUpdatesInput,
): {
  positionByObjectId: Record<string, MembershipBoardPoint>;
  membershipByObjectId: Record<string, ContainerMembershipPatch>;
} {
  const clampToSectionBounds = input.options?.clampToSectionBounds ?? true;
  const includeObjectsInNextBounds = input.options?.includeObjectsInNextBounds ?? true;
  const sections = getGridSectionBoundsFromGeometry(
    input.containerGeometry,
    input.rows,
    input.cols,
    input.gap,
  );
  const nextContainerBounds: MembershipObjectBounds = {
    left: input.containerGeometry.x,
    right: input.containerGeometry.x + input.containerGeometry.width,
    top: input.containerGeometry.y,
    bottom: input.containerGeometry.y + input.containerGeometry.height,
  };
  const objectById = new Map(input.objectEntries);
  const containerItem = objectById.get(input.containerId);
  const currentContainerGeometry =
    containerItem && containerItem.type === "gridContainer"
      ? (input.getCurrentObjectGeometry(input.containerId) ?? {
          x: containerItem.x,
          y: containerItem.y,
          width: containerItem.width,
          height: containerItem.height,
          rotationDeg: containerItem.rotationDeg,
        })
      : input.containerGeometry;
  const currentRows =
    containerItem && containerItem.type === "gridContainer"
      ? Math.max(1, Math.min(input.maxRows, containerItem.gridRows ?? input.rows))
      : input.rows;
  const currentCols =
    containerItem && containerItem.type === "gridContainer"
      ? Math.max(1, Math.min(input.maxCols, containerItem.gridCols ?? input.cols))
      : input.cols;
  const currentGap =
    containerItem && containerItem.type === "gridContainer"
      ? Math.max(0, containerItem.gridGap ?? input.gap)
      : input.gap;
  const currentSections = getGridSectionBoundsFromGeometry(
    currentContainerGeometry,
    currentRows,
    currentCols,
    currentGap,
  );
  const currentContainerBounds: MembershipObjectBounds = {
    left: currentContainerGeometry.x,
    right: currentContainerGeometry.x + currentContainerGeometry.width,
    top: currentContainerGeometry.y,
    bottom: currentContainerGeometry.y + currentContainerGeometry.height,
  };
  const positionByObjectId: Record<string, MembershipBoardPoint> = {};
  const membershipByObjectId: Record<string, ContainerMembershipPatch> = {};

  objectById.forEach((objectItem) => {
    if (!isContainerChildEligible(objectItem.type, input.isConnectorKind)) {
      return;
    }

    const geometry = input.getCurrentObjectGeometry(objectItem.id) ?? {
      x: objectItem.x,
      y: objectItem.y,
      width: objectItem.width,
      height: objectItem.height,
      rotationDeg: objectItem.rotationDeg,
    };
    const center = getObjectCenterForPlacement(geometry);
    const belongsToContainer =
      objectItem.containerId === input.containerId ||
      isPointInsideBounds(center, currentContainerBounds) ||
      (includeObjectsInNextBounds && isPointInsideBounds(center, nextContainerBounds));
    if (!belongsToContainer) {
      return;
    }

    const explicitSectionIndex = objectItem.containerSectionIndex;
    const sourceSectionIndex =
      typeof explicitSectionIndex === "number" &&
      explicitSectionIndex >= 0 &&
      explicitSectionIndex < currentSections.length
        ? explicitSectionIndex
        : getClosestSectionIndex(center, currentSections);
    const targetSectionIndex =
      typeof explicitSectionIndex === "number" &&
      explicitSectionIndex >= 0 &&
      explicitSectionIndex < sections.length
        ? explicitSectionIndex
        : sourceSectionIndex !== null && sourceSectionIndex < sections.length
          ? sourceSectionIndex
          : getClosestSectionIndex(center, sections);
    if (targetSectionIndex === null) {
      return;
    }

    const section = sections[targetSectionIndex];
    const sourceRelative =
      sourceSectionIndex !== null && sourceSectionIndex < currentSections.length
        ? toSectionRelativeCoordinate(center, currentSections[sourceSectionIndex])
        : {
            x: clampToRange(objectItem.containerRelX ?? 0.5, 0, 1),
            y: clampToRange(objectItem.containerRelY ?? 0.5, 0, 1),
          };
    const sectionWidth = Math.max(1, section.right - section.left);
    const sectionHeight = Math.max(1, section.bottom - section.top);
    const preferredTopLeft = {
      x: section.left + sourceRelative.x * sectionWidth - geometry.width / 2,
      y: section.top + sourceRelative.y * sectionHeight - geometry.height / 2,
    };
    const nextTopLeft = clampToSectionBounds
      ? clampObjectTopLeftToSection(
          section,
          { width: geometry.width, height: geometry.height },
          preferredTopLeft,
        )
      : preferredTopLeft;
    const nextCenter = {
      x: nextTopLeft.x + geometry.width / 2,
      y: nextTopLeft.y + geometry.height / 2,
    };
    const nextRelative = toSectionRelativeCoordinate(nextCenter, section);
    const nextMembership: ContainerMembershipPatch = {
      containerId: input.containerId,
      containerSectionIndex: targetSectionIndex,
      containerRelX: input.roundToStep(nextRelative.x, 0.001),
      containerRelY: input.roundToStep(nextRelative.y, 0.001),
    };

    positionByObjectId[objectItem.id] = { x: nextTopLeft.x, y: nextTopLeft.y };
    membershipByObjectId[objectItem.id] = nextMembership;
  });

  return { positionByObjectId, membershipByObjectId };
}
