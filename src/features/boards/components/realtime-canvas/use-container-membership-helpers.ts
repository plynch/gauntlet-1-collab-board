import type { BoardObjectKind } from "@/features/boards/types";
import type {
  MembershipBoardPoint,
  MembershipObjectBounds,
  MembershipObjectGeometry,
} from "@/features/boards/components/realtime-canvas/use-container-membership";

export function getObjectCenterForPlacement(
  geometry: MembershipObjectGeometry,
): MembershipBoardPoint {
  return {
    x: geometry.x + geometry.width / 2,
    y: geometry.y + geometry.height / 2,
  };
}

export function isPointInsideBounds(
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

export function isContainerChildEligible(
  type: BoardObjectKind,
  isConnectorKind: (value: BoardObjectKind) => boolean,
): boolean {
  return type !== "gridContainer" && !isConnectorKind(type);
}
