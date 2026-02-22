import type {
  ConnectorDraft,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function toGeometrySignature(geometry: ObjectGeometry): string {
  return [
    roundToTenths(geometry.x),
    roundToTenths(geometry.y),
    roundToTenths(geometry.width),
    roundToTenths(geometry.height),
    roundToTenths(geometry.rotationDeg),
  ].join(",");
}

export function buildRouteKey(
  connectorId: string,
  connectorDraft: ConnectorDraft,
  connectableGeometryById: Map<string, ObjectGeometry>,
  obstacleSignature: string,
): string {
  const fromGeometry = connectorDraft.fromObjectId
    ? connectableGeometryById.get(connectorDraft.fromObjectId) ?? null
    : null;
  const toGeometry = connectorDraft.toObjectId
    ? connectableGeometryById.get(connectorDraft.toObjectId) ?? null
    : null;

  return [
    connectorId,
    connectorDraft.fromObjectId ?? "null",
    connectorDraft.toObjectId ?? "null",
    connectorDraft.fromAnchor ?? "null",
    connectorDraft.toAnchor ?? "null",
    roundToTenths(connectorDraft.fromX),
    roundToTenths(connectorDraft.fromY),
    roundToTenths(connectorDraft.toX),
    roundToTenths(connectorDraft.toY),
    fromGeometry ? toGeometrySignature(fromGeometry) : "none",
    toGeometry ? toGeometrySignature(toGeometry) : "none",
    obstacleSignature,
  ].join("|");
}
