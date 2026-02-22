import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  CONNECTOR_HIT_PADDING,
  CONNECTOR_OBSTACLE_CULL_PADDING_PX,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  ConnectorDraft,
  ConnectorEndpointDragState,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  buildConnectorRouteGeometry,
  CONNECTOR_ANCHORS,
  CONNECTOR_MIN_SEGMENT_SIZE,
  doBoundsOverlap,
  getAnchorDirectionForGeometry,
  getAnchorPointForGeometry,
  getConnectorHitBounds,
  inflateObjectBounds,
  scoreConnectorRoute,
  scoreEndpointDirectionAlignment,
  type ConnectorRouteGeometry,
  type ConnectorRoutingObstacle,
  type ObjectBounds,
  type ResolvedConnectorEndpoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";

type ConnectableShapeKind = Exclude<
  BoardObjectKind,
  "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
>;

export type ConnectorRouteResult = {
  resolved: {
    from: ResolvedConnectorEndpoint;
    to: ResolvedConnectorEndpoint;
    draft: ConnectorDraft;
  };
  geometry: ConnectorRouteGeometry;
};

type BuildEndpointCandidatesOptions = {
  endpoint: "from" | "to";
  connectorId: string;
  connectorDraft: ConnectorDraft;
  activeEndpointDrag: ConnectorEndpointDragState | null;
  connectableGeometryById: Map<string, ObjectGeometry>;
  connectableTypeById: Map<string, ConnectableShapeKind>;
};

type ComputeConnectorRoutesOptions = {
  objects: BoardObject[];
  draftConnectorById: Record<string, ConnectorDraft>;
  draftGeometryById: Record<string, ObjectGeometry>;
  connectableGeometryById: Map<string, ObjectGeometry>;
  connectableTypeById: Map<string, ConnectableShapeKind>;
  connectorRoutingObstacles: ConnectorRoutingObstacle[];
  connectorViewportBounds: ObjectBounds | null;
  selectedConnectorIds: Set<string>;
  activeEndpointDrag: ConnectorEndpointDragState | null;
};

function buildEndpointCandidates({
  endpoint,
  connectorId,
  connectorDraft,
  activeEndpointDrag,
  connectableGeometryById,
  connectableTypeById,
}: BuildEndpointCandidatesOptions): ResolvedConnectorEndpoint[] {
  const objectId =
    endpoint === "from"
      ? connectorDraft.fromObjectId
      : connectorDraft.toObjectId;
  const fallbackPoint =
    endpoint === "from"
      ? { x: connectorDraft.fromX, y: connectorDraft.fromY }
      : { x: connectorDraft.toX, y: connectorDraft.toY };
  const selectedAnchor =
    endpoint === "from" ? connectorDraft.fromAnchor : connectorDraft.toAnchor;

  if (!objectId) {
    return [
      {
        x: fallbackPoint.x,
        y: fallbackPoint.y,
        objectId: null,
        anchor: null,
        direction: null,
        connected: false,
      },
    ];
  }

  const endpointGeometry = connectableGeometryById.get(objectId);
  if (!endpointGeometry) {
    return [
      {
        x: fallbackPoint.x,
        y: fallbackPoint.y,
        objectId: null,
        anchor: null,
        direction: null,
        connected: false,
      },
    ];
  }

  const endpointType = connectableTypeById.get(objectId) ?? "rect";
  const isDraggingThisEndpoint =
    activeEndpointDrag?.objectId === connectorId &&
    activeEndpointDrag.endpoint === endpoint;
  const anchors =
    isDraggingThisEndpoint && selectedAnchor
      ? [selectedAnchor]
      : selectedAnchor
        ? [
            selectedAnchor,
            ...CONNECTOR_ANCHORS.filter((anchor) => anchor !== selectedAnchor),
          ]
        : [...CONNECTOR_ANCHORS];

  return anchors.map((anchor) => {
    const point = getAnchorPointForGeometry(endpointGeometry, anchor, endpointType);
    return {
      x: point.x,
      y: point.y,
      objectId,
      anchor,
      direction: getAnchorDirectionForGeometry(anchor, endpointGeometry),
      connected: true,
    };
  });
}

export function computeConnectorRoutes({
  objects,
  draftConnectorById,
  draftGeometryById,
  connectableGeometryById,
  connectableTypeById,
  connectorRoutingObstacles,
  connectorViewportBounds,
  selectedConnectorIds,
  activeEndpointDrag,
}: ComputeConnectorRoutesOptions): Map<string, ConnectorRouteResult> {
  const routes = new Map<string, ConnectorRouteResult>();

  objects.forEach((objectItem) => {
    if (!isConnectorKind(objectItem.type)) {
      return;
    }

    const localDraft = draftConnectorById[objectItem.id] ?? null;
    const connectorGeometryDraft = draftGeometryById[objectItem.id] ?? {
      x: objectItem.x,
      y: objectItem.y,
      width: objectItem.width,
      height: objectItem.height,
      rotationDeg: objectItem.rotationDeg,
    };
    const defaultFromX =
      objectItem.fromX ??
      connectorGeometryDraft.x +
        Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.width) *
          0.1;
    const defaultFromY =
      objectItem.fromY ??
      connectorGeometryDraft.y +
        Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.height) *
          0.5;
    const defaultToX =
      objectItem.toX ??
      connectorGeometryDraft.x +
        Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.width) *
          0.9;
    const defaultToY =
      objectItem.toY ??
      connectorGeometryDraft.y +
        Math.max(CONNECTOR_MIN_SEGMENT_SIZE, connectorGeometryDraft.height) *
          0.5;
    const connectorDraft: ConnectorDraft = localDraft ?? {
      fromObjectId: objectItem.fromObjectId ?? null,
      toObjectId: objectItem.toObjectId ?? null,
      fromAnchor: objectItem.fromAnchor ?? null,
      toAnchor: objectItem.toAnchor ?? null,
      fromX: defaultFromX,
      fromY: defaultFromY,
      toX: defaultToX,
      toY: defaultToY,
    };

    const isConnectorSelected = selectedConnectorIds.has(objectItem.id);
    const connectorScreenBounds = getConnectorHitBounds(
      { x: connectorDraft.fromX, y: connectorDraft.fromY },
      { x: connectorDraft.toX, y: connectorDraft.toY },
      CONNECTOR_HIT_PADDING + CONNECTOR_OBSTACLE_CULL_PADDING_PX,
    );
    const shouldCullConnector =
      connectorViewportBounds !== null &&
      !isConnectorSelected &&
      !localDraft &&
      activeEndpointDrag?.objectId !== objectItem.id &&
      !doBoundsOverlap(connectorScreenBounds, connectorViewportBounds);
    if (shouldCullConnector) {
      return;
    }

    const fromCandidates = buildEndpointCandidates({
      endpoint: "from",
      connectorId: objectItem.id,
      connectorDraft,
      activeEndpointDrag,
      connectableGeometryById,
      connectableTypeById,
    });
    const toCandidates = buildEndpointCandidates({
      endpoint: "to",
      connectorId: objectItem.id,
      connectorDraft,
      activeEndpointDrag,
      connectableGeometryById,
      connectableTypeById,
    });

    let bestResolved: {
      from: ResolvedConnectorEndpoint;
      to: ResolvedConnectorEndpoint;
    } | null = null;
    let bestGeometry: ConnectorRouteGeometry | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const fromCandidate of fromCandidates) {
      for (const toCandidate of toCandidates) {
        if (
          fromCandidate.connected &&
          toCandidate.connected &&
          fromCandidate.objectId === toCandidate.objectId &&
          fromCandidate.anchor === toCandidate.anchor
        ) {
          continue;
        }

        const routeSolveBounds = inflateObjectBounds(
          {
            left: Math.min(fromCandidate.x, toCandidate.x),
            right: Math.max(fromCandidate.x, toCandidate.x),
            top: Math.min(fromCandidate.y, toCandidate.y),
            bottom: Math.max(fromCandidate.y, toCandidate.y),
          },
          CONNECTOR_HIT_PADDING + CONNECTOR_OBSTACLE_CULL_PADDING_PX,
        );
        const obstacles = connectorRoutingObstacles.filter(
          (obstacle) =>
            obstacle.objectId !== fromCandidate.objectId &&
            obstacle.objectId !== toCandidate.objectId &&
            doBoundsOverlap(obstacle.bounds, routeSolveBounds),
        );
        const geometry = buildConnectorRouteGeometry({
          from: fromCandidate,
          to: toCandidate,
          obstacles,
          padding: CONNECTOR_HIT_PADDING,
        });

        let score = scoreConnectorRoute(geometry.points, obstacles);
        score += scoreEndpointDirectionAlignment(
          fromCandidate,
          toCandidate,
          fromCandidate.direction,
          toCandidate.direction,
        );
        if (
          fromCandidate.connected &&
          connectorDraft.fromAnchor &&
          fromCandidate.anchor !== connectorDraft.fromAnchor
        ) {
          score += 14;
        }
        if (
          toCandidate.connected &&
          connectorDraft.toAnchor &&
          toCandidate.anchor !== connectorDraft.toAnchor
        ) {
          score += 14;
        }
        if (
          fromCandidate.connected &&
          toCandidate.connected &&
          fromCandidate.objectId === toCandidate.objectId
        ) {
          score += 300;
        }

        if (score < bestScore) {
          bestScore = score;
          bestResolved = {
            from: fromCandidate,
            to: toCandidate,
          };
          bestGeometry = geometry;
        }
      }
    }

    if (!bestResolved || !bestGeometry) {
      return;
    }

    routes.set(objectItem.id, {
      resolved: {
        from: bestResolved.from,
        to: bestResolved.to,
        draft: connectorDraft,
      },
      geometry: bestGeometry,
    });
  });

  return routes;
}
