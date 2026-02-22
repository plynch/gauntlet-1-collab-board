import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import type {
  ContainerMembershipPatch,
  MembershipBoardPoint,
  MembershipObjectGeometry,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import { isContainerChildEligible } from "@/features/boards/components/realtime-canvas/use-container-membership-helpers";

type BuildMembershipPatchesInput = {
  nextPositionsById: Record<string, MembershipBoardPoint>;
  seedPatches?: Record<string, ContainerMembershipPatch>;
  objectEntries: Iterable<[string, BoardObject]>;
  getCurrentObjectGeometry: (objectId: string) => MembershipObjectGeometry | null;
  isConnectorKind: (value: BoardObjectKind) => boolean;
  resolveContainerMembershipForGeometry: (
    objectId: string,
    geometry: MembershipObjectGeometry,
    containerSectionsById: Map<string, unknown>,
  ) => ContainerMembershipPatch;
  getContainerSectionsInfoById: (
    geometryOverrides: Record<string, MembershipObjectGeometry>,
  ) => Map<string, unknown>;
  getMembershipPatchFromObject: (
    objectItem: BoardObject,
  ) => ContainerMembershipPatch;
  areContainerMembershipPatchesEqual: (
    left: ContainerMembershipPatch,
    right: ContainerMembershipPatch,
  ) => boolean;
};

export function buildContainerMembershipPatchesForPositions(
  input: BuildMembershipPatchesInput,
): Record<string, ContainerMembershipPatch> {
  const objectById = new Map(input.objectEntries);
  const geometryOverrides: Record<string, MembershipObjectGeometry> = {};
  Object.entries(input.nextPositionsById).forEach(([objectId, nextPosition]) => {
    const geometry = input.getCurrentObjectGeometry(objectId) ?? {
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

  const containerSectionsById = input.getContainerSectionsInfoById(geometryOverrides);
  const nextPatches: Record<string, ContainerMembershipPatch> = {
    ...(input.seedPatches ?? {}),
  };

  Object.entries(input.nextPositionsById).forEach(([objectId, nextPosition]) => {
    const objectItem = objectById.get(objectId);
    if (!objectItem || !isContainerChildEligible(objectItem.type, input.isConnectorKind)) {
      return;
    }

    const geometry = geometryOverrides[objectId] ?? {
      x: nextPosition.x,
      y: nextPosition.y,
      width: objectItem.width,
      height: objectItem.height,
      rotationDeg: objectItem.rotationDeg,
    };
    const nextMembership = input.resolveContainerMembershipForGeometry(
      objectId,
      geometry,
      containerSectionsById,
    );
    const currentMembership = input.getMembershipPatchFromObject(objectItem);
    const seedMembership = nextPatches[objectId];

    if (
      seedMembership &&
      input.areContainerMembershipPatchesEqual(seedMembership, nextMembership)
    ) {
      return;
    }
    if (!input.areContainerMembershipPatchesEqual(currentMembership, nextMembership)) {
      nextPatches[objectId] = nextMembership;
    }
  });

  return nextPatches;
}
