import { useCallback, type MutableRefObject } from "react";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  clampObjectTopLeftToSection,
  clampToRange,
  getClosestSectionIndex,
  getGridSectionBoundsFromGeometry,
  getSectionBoundsCenter,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";

export type MembershipBoardPoint = {
  x: number;
  y: number;
};

export type MembershipObjectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type MembershipObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

export type ContainerMembershipPatch = {
  containerId: string | null;
  containerSectionIndex: number | null;
  containerRelX: number | null;
  containerRelY: number | null;
};

type GridSectionBounds = {
  containerId: string;
  containerZIndex: number;
  sectionIndex: number;
  bounds: MembershipObjectBounds;
};

type ContainerSectionsInfo = {
  containerId: string;
  containerZIndex: number;
  rows: number;
  cols: number;
  gap: number;
  geometry: MembershipObjectGeometry;
  sections: MembershipObjectBounds[];
};

type UseContainerMembershipArgs = {
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  getCurrentObjectGeometry: (
    objectId: string,
  ) => MembershipObjectGeometry | null;
  maxRows: number;
  maxCols: number;
  defaultGap: number;
  getDistance: (
    left: MembershipBoardPoint,
    right: MembershipBoardPoint,
  ) => number;
  roundToStep: (value: number, step: number) => number;
  isConnectorKind: (value: BoardObjectKind) => boolean;
};

/**
 * Gets object center for placement.
 */
function getObjectCenterForPlacement(
  geometry: MembershipObjectGeometry,
): MembershipBoardPoint {
  return {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
}

/**
 * Returns whether point inside bounds is true.
 */
function isPointInsideBounds(
  point: MembershipBoardPoint,
  bounds: MembershipObjectBounds,
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

/**
 * Returns whether container child eligible is true.
 */
function isContainerChildEligible(
  type: BoardObjectKind,
  isConnectorKind: (value: BoardObjectKind) => boolean,
): boolean {
  return type !== "gridContainer" && !isConnectorKind(type);
}

/**
 * Gets membership patch from object.
 */
export function getMembershipPatchFromObject(
  objectItem: BoardObject,
): ContainerMembershipPatch {
  return {
    containerId: objectItem.containerId ?? null,
    containerSectionIndex: objectItem.containerSectionIndex ?? null,
    containerRelX: objectItem.containerRelX ?? null,
    containerRelY: objectItem.containerRelY ?? null,
  };
}

/**
 * Handles are container membership patches equal.
 */
export function areContainerMembershipPatchesEqual(
  left: ContainerMembershipPatch,
  right: ContainerMembershipPatch,
): boolean {
  return (
    left.containerId === right.containerId &&
    left.containerSectionIndex === right.containerSectionIndex &&
    left.containerRelX === right.containerRelX &&
    left.containerRelY === right.containerRelY
  );
}

/**
 * Handles use container membership.
 */
export function useContainerMembership({
  objectsByIdRef,
  getCurrentObjectGeometry,
  maxRows,
  maxCols,
  defaultGap,
  getDistance,
  roundToStep,
  isConnectorKind,
}: UseContainerMembershipArgs) {
  const getContainerSectionsInfoById = useCallback(
    (
      geometryOverrides: Record<string, MembershipObjectGeometry> = {},
    ): Map<string, ContainerSectionsInfo> => {
      const infos = new Map<string, ContainerSectionsInfo>();

      objectsByIdRef.current.forEach((objectItem) => {
        if (objectItem.type !== "gridContainer") {
          return;
        }

        const geometry = geometryOverrides[objectItem.id] ??
          getCurrentObjectGeometry(objectItem.id) ?? {
            x: objectItem.x,
            y: objectItem.y,
            width: objectItem.width,
            height: objectItem.height,
            rotationDeg: objectItem.rotationDeg,
          };
        const rows = Math.max(1, Math.min(maxRows, objectItem.gridRows ?? 2));
        const cols = Math.max(1, Math.min(maxCols, objectItem.gridCols ?? 2));
        const gap = Math.max(0, objectItem.gridGap ?? defaultGap);
        infos.set(objectItem.id, {
          containerId: objectItem.id,
          containerZIndex: objectItem.zIndex,
          rows,
          cols,
          gap,
          geometry,
          sections: getGridSectionBoundsFromGeometry(geometry, rows, cols, gap),
        });
      });

      return infos;
    },
    [defaultGap, getCurrentObjectGeometry, maxCols, maxRows, objectsByIdRef],
  );

  const resolveContainerMembershipForGeometry = useCallback(
    (
      objectId: string,
      geometry: MembershipObjectGeometry,
      containerSectionsById: Map<string, ContainerSectionsInfo>,
    ): ContainerMembershipPatch => {
      const objectItem = objectsByIdRef.current.get(objectId);
      if (
        !objectItem ||
        !isContainerChildEligible(objectItem.type, isConnectorKind)
      ) {
        return {
          containerId: null,
          containerSectionIndex: null,
          containerRelX: null,
          containerRelY: null,
        };
      }

      const center = getObjectCenterForPlacement(geometry);
      const candidateSections: GridSectionBounds[] = [];

      containerSectionsById.forEach((containerInfo) => {
        if (containerInfo.containerId === objectId) {
          return;
        }

        containerInfo.sections.forEach((section, sectionIndex) => {
          if (isPointInsideBounds(center, section)) {
            candidateSections.push({
              containerId: containerInfo.containerId,
              containerZIndex: containerInfo.containerZIndex,
              sectionIndex,
              bounds: section,
            });
          }
        });
      });

      if (candidateSections.length === 0) {
        return {
          containerId: null,
          containerSectionIndex: null,
          containerRelX: null,
          containerRelY: null,
        };
      }

      candidateSections.sort((left, right) => {
        if (left.containerZIndex !== right.containerZIndex) {
          return right.containerZIndex - left.containerZIndex;
        }

        const leftCenter = getSectionBoundsCenter(left.bounds);
        const rightCenter = getSectionBoundsCenter(right.bounds);
        const leftDistance = getDistance(center, leftCenter);
        const rightDistance = getDistance(center, rightCenter);
        return leftDistance - rightDistance;
      });

      const winner = candidateSections[0];
      const relative = toSectionRelativeCoordinate(center, winner.bounds);

      return {
        containerId: winner.containerId,
        containerSectionIndex: winner.sectionIndex,
        containerRelX: roundToStep(relative.x, 0.001),
        containerRelY: roundToStep(relative.y, 0.001),
      };
    },
    [getDistance, isConnectorKind, objectsByIdRef, roundToStep],
  );

  const getSectionAnchoredObjectUpdatesForContainer = useCallback(
    (
      containerId: string,
      containerGeometry: MembershipObjectGeometry,
      rows: number,
      cols: number,
      gap: number,
      options: {
        clampToSectionBounds?: boolean;
        includeObjectsInNextBounds?: boolean;
      } = {},
    ): {
      positionByObjectId: Record<string, MembershipBoardPoint>;
      membershipByObjectId: Record<string, ContainerMembershipPatch>;
    } => {
      const clampToSectionBounds = options.clampToSectionBounds ?? true;
      const includeObjectsInNextBounds =
        options.includeObjectsInNextBounds ?? true;
      const sections = getGridSectionBoundsFromGeometry(
        containerGeometry,
        rows,
        cols,
        gap,
      );
      const nextContainerBounds: MembershipObjectBounds = {
        left: containerGeometry.x,
        right: containerGeometry.x + containerGeometry.width,
        top: containerGeometry.y,
        bottom: containerGeometry.y + containerGeometry.height,
      };
      const containerItem = objectsByIdRef.current.get(containerId);
      const currentContainerGeometry =
        containerItem && containerItem.type === "gridContainer"
          ? (getCurrentObjectGeometry(containerId) ?? {
              x: containerItem.x,
              y: containerItem.y,
              width: containerItem.width,
              height: containerItem.height,
              rotationDeg: containerItem.rotationDeg,
            })
          : containerGeometry;
      const currentRows =
        containerItem && containerItem.type === "gridContainer"
          ? Math.max(1, Math.min(maxRows, containerItem.gridRows ?? rows))
          : rows;
      const currentCols =
        containerItem && containerItem.type === "gridContainer"
          ? Math.max(1, Math.min(maxCols, containerItem.gridCols ?? cols))
          : cols;
      const currentGap =
        containerItem && containerItem.type === "gridContainer"
          ? Math.max(0, containerItem.gridGap ?? gap)
          : gap;
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

      objectsByIdRef.current.forEach((objectItem) => {
        if (!isContainerChildEligible(objectItem.type, isConnectorKind)) {
          return;
        }

        const geometry = getCurrentObjectGeometry(objectItem.id) ?? {
          x: objectItem.x,
          y: objectItem.y,
          width: objectItem.width,
          height: objectItem.height,
          rotationDeg: objectItem.rotationDeg,
        };
        const center = getObjectCenterForPlacement(geometry);
        const belongsToContainer =
          objectItem.containerId === containerId ||
          isPointInsideBounds(center, currentContainerBounds) ||
          (includeObjectsInNextBounds &&
            isPointInsideBounds(center, nextContainerBounds));

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
            : sourceSectionIndex !== null &&
                sourceSectionIndex < sections.length
              ? sourceSectionIndex
              : getClosestSectionIndex(center, sections);
        if (targetSectionIndex === null) {
          return;
        }

        const section = sections[targetSectionIndex];
        const sourceRelative =
          sourceSectionIndex !== null &&
          sourceSectionIndex < currentSections.length
            ? toSectionRelativeCoordinate(
                center,
                currentSections[sourceSectionIndex],
              )
            : {
                x: clampToRange(objectItem.containerRelX ?? 0.5, 0, 1),
                y: clampToRange(objectItem.containerRelY ?? 0.5, 0, 1),
              };
        const sectionWidth = Math.max(1, section.right - section.left);
        const sectionHeight = Math.max(1, section.bottom - section.top);
        const targetCenterX = section.left + sourceRelative.x * sectionWidth;
        const targetCenterY = section.top + sourceRelative.y * sectionHeight;
        const preferredTopLeft = {
          x: targetCenterX - geometry.width / 2,
          y: targetCenterY - geometry.height / 2,
        };
        const nextTopLeft = clampToSectionBounds
          ? clampObjectTopLeftToSection(
              section,
              {
                width: geometry.width,
                height: geometry.height,
              },
              preferredTopLeft,
            )
          : preferredTopLeft;
        const nextX = nextTopLeft.x;
        const nextY = nextTopLeft.y;

        const nextCenter = {
          x: nextX + geometry.width / 2,
          y: nextY + geometry.height / 2,
        };
        const nextRelative = toSectionRelativeCoordinate(nextCenter, section);
        const nextMembership: ContainerMembershipPatch = {
          containerId,
          containerSectionIndex: targetSectionIndex,
          containerRelX: roundToStep(nextRelative.x, 0.001),
          containerRelY: roundToStep(nextRelative.y, 0.001),
        };

        positionByObjectId[objectItem.id] = { x: nextX, y: nextY };
        membershipByObjectId[objectItem.id] = nextMembership;
      });

      return { positionByObjectId, membershipByObjectId };
    },
    [
      getCurrentObjectGeometry,
      isConnectorKind,
      maxCols,
      maxRows,
      objectsByIdRef,
      roundToStep,
    ],
  );

  const buildContainerMembershipPatchesForPositions = useCallback(
    (
      nextPositionsById: Record<string, MembershipBoardPoint>,
      seedPatches: Record<string, ContainerMembershipPatch> = {},
    ): Record<string, ContainerMembershipPatch> => {
      const geometryOverrides: Record<string, MembershipObjectGeometry> = {};
      Object.entries(nextPositionsById).forEach(([objectId, nextPosition]) => {
        const geometry = getCurrentObjectGeometry(objectId) ?? {
          x: nextPosition.x,
          y: nextPosition.y,
          width: 0,
          height: 0,
          rotationDeg: 0,
        };
        geometryOverrides[objectId] = {
          ...geometry,
          x: nextPosition.x,
          y: nextPosition.y,
        };
      });

      const containerSectionsById =
        getContainerSectionsInfoById(geometryOverrides);
      const nextPatches: Record<string, ContainerMembershipPatch> = {
        ...seedPatches,
      };

      Object.entries(nextPositionsById).forEach(([objectId, nextPosition]) => {
        const objectItem = objectsByIdRef.current.get(objectId);
        if (
          !objectItem ||
          !isContainerChildEligible(objectItem.type, isConnectorKind)
        ) {
          return;
        }

        const geometry = geometryOverrides[objectId] ?? {
          x: nextPosition.x,
          y: nextPosition.y,
          width: objectItem.width,
          height: objectItem.height,
          rotationDeg: objectItem.rotationDeg,
        };
        const nextMembership = resolveContainerMembershipForGeometry(
          objectId,
          geometry,
          containerSectionsById,
        );
        const currentMembership = getMembershipPatchFromObject(objectItem);
        const seedMembership = nextPatches[objectId];
        if (
          seedMembership &&
          areContainerMembershipPatchesEqual(seedMembership, nextMembership)
        ) {
          return;
        }
        if (
          !areContainerMembershipPatchesEqual(currentMembership, nextMembership)
        ) {
          nextPatches[objectId] = nextMembership;
        }
      });

      return nextPatches;
    },
    [
      getContainerSectionsInfoById,
      getCurrentObjectGeometry,
      isConnectorKind,
      objectsByIdRef,
      resolveContainerMembershipForGeometry,
    ],
  );

  return {
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
  };
}
