import { useCallback, type MutableRefObject } from "react";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  getGridSectionBoundsFromGeometry,
  getSectionBoundsCenter,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import {
  getObjectCenterForPlacement,
  isContainerChildEligible,
  isPointInsideBounds,
} from "@/features/boards/components/realtime-canvas/use-container-membership-helpers";
import { buildContainerMembershipPatchesForPositions as buildMembershipPatches } from "@/features/boards/components/realtime-canvas/use-container-membership-patches";
import { getSectionAnchoredObjectUpdatesForContainer as getSectionAnchoredUpdates } from "@/features/boards/components/realtime-canvas/use-container-membership-runtime";

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
    ) =>
      getSectionAnchoredUpdates({
        containerId,
        containerGeometry,
        rows,
        cols,
        gap,
        objectEntries: objectsByIdRef.current.entries(),
        getCurrentObjectGeometry,
        isConnectorKind,
        maxRows,
        maxCols,
        roundToStep,
        options,
      }),
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
    ) =>
      buildMembershipPatches({
        nextPositionsById,
        seedPatches,
        objectEntries: objectsByIdRef.current.entries(),
        getCurrentObjectGeometry,
        isConnectorKind,
        resolveContainerMembershipForGeometry: (
          objectId,
          geometry,
          containerSectionsById,
        ) =>
          resolveContainerMembershipForGeometry(
            objectId,
            geometry,
            containerSectionsById as Map<string, ContainerSectionsInfo>,
          ),
        getContainerSectionsInfoById: (geometryOverrides) =>
          getContainerSectionsInfoById(geometryOverrides) as Map<string, unknown>,
        getMembershipPatchFromObject,
        areContainerMembershipPatchesEqual,
      }),
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
