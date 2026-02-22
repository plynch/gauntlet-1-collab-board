import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import { isConnectorKind } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  CONNECTOR_HIT_PADDING,
  CONNECTOR_OBSTACLE_CULL_PADDING_PX,
  CONNECTOR_OBSTACLE_GRID_CELL_SIZE,
  CONNECTOR_ROUTE_RECOMPUTE_BUDGET,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  ConnectorDraft,
  ConnectorEndpointDragState,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  doBoundsOverlap,
  getConnectorHitBounds,
  inflateObjectBounds,
  type ConnectorRoutingObstacle,
  type ObjectBounds,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  buildObstacleSignature,
  createConnectorObstacleSpatialIndex,
} from "@/features/boards/components/realtime-canvas/legacy/connector-obstacle-spatial-index";
import {
  cleanupRouteCache,
  getCachedRoute,
  selectConnectorsForRecompute,
  setCachedRoute,
  type DirtyConnectorEntry,
} from "@/features/boards/components/realtime-canvas/legacy/connector-route-cache";
import {
  buildEndpointCandidates,
  buildRouteKey,
  getConnectorDraft,
  solveConnectorRoute,
  type ConnectorRouteResult,
  type ConnectorSolveContext,
} from "@/features/boards/components/realtime-canvas/legacy/connector-route-helpers";

type ComputeConnectorRoutesOptions = {
  objects: BoardObject[];
  draftConnectorById: Record<string, ConnectorDraft>;
  draftGeometryById: Record<string, ObjectGeometry>;
  connectableGeometryById: Map<string, ObjectGeometry>;
  connectableTypeById: Map<
    string,
    Exclude<
      BoardObjectKind,
      "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
    >
  >;
  connectorRoutingObstacles: ConnectorRoutingObstacle[];
  connectorViewportBounds: ObjectBounds | null;
  selectedConnectorIds: Set<string>;
  activeEndpointDrag: ConnectorEndpointDragState | null;
};

function shouldCullConnector(
  connectorBounds: ObjectBounds,
  viewportBounds: ObjectBounds | null,
  isConnectorSelected: boolean,
  hasLocalDraft: boolean,
  isDraggingEndpoint: boolean,
): boolean {
  return (
    viewportBounds !== null &&
    !isConnectorSelected &&
    !hasLocalDraft &&
    !isDraggingEndpoint &&
    !doBoundsOverlap(connectorBounds, viewportBounds)
  );
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
  const activeConnectorIds = new Set<string>();
  const dirtyEntries: DirtyConnectorEntry[] = [];
  const solveByConnectorId = new Map<string, ConnectorSolveContext & { routeKey: string }>();
  const obstacleIndex = createConnectorObstacleSpatialIndex(
    connectorRoutingObstacles,
    CONNECTOR_OBSTACLE_GRID_CELL_SIZE,
  );

  objects.forEach((objectItem) => {
    if (!isConnectorKind(objectItem.type)) {
      return;
    }
    activeConnectorIds.add(objectItem.id);

    const localDraft = draftConnectorById[objectItem.id] ?? null;
    const connectorGeometryDraft = draftGeometryById[objectItem.id] ?? {
      x: objectItem.x,
      y: objectItem.y,
      width: objectItem.width,
      height: objectItem.height,
      rotationDeg: objectItem.rotationDeg,
    };
    const connectorDraft = getConnectorDraft(
      objectItem,
      connectorGeometryDraft,
      localDraft,
    );
    const connectorBounds = getConnectorHitBounds(
      { x: connectorDraft.fromX, y: connectorDraft.fromY },
      { x: connectorDraft.toX, y: connectorDraft.toY },
      CONNECTOR_HIT_PADDING + CONNECTOR_OBSTACLE_CULL_PADDING_PX,
    );
    const isSelected = selectedConnectorIds.has(objectItem.id);
    const isDraggingEndpoint = activeEndpointDrag?.objectId === objectItem.id;
    if (
      shouldCullConnector(
        connectorBounds,
        connectorViewportBounds,
        isSelected,
        localDraft !== null,
        isDraggingEndpoint,
      )
    ) {
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
    const nearbyObstacleBounds = inflateObjectBounds(
      connectorBounds,
      CONNECTOR_OBSTACLE_CULL_PADDING_PX,
    );
    const nearbyObstacles = obstacleIndex.query(nearbyObstacleBounds);
    const routeKey = buildRouteKey(
      objectItem.id,
      connectorDraft,
      connectableGeometryById,
      buildObstacleSignature(nearbyObstacles),
    );
    const cachedRoute = getCachedRoute(
      objectItem.id,
      routeKey,
    ) as ConnectorRouteResult | null;
    if (cachedRoute) {
      routes.set(objectItem.id, cachedRoute);
    }

    dirtyEntries.push({
      connectorId: objectItem.id,
      priority: isSelected || localDraft !== null || isDraggingEndpoint,
      hasCachedRoute: cachedRoute !== null,
    });
    solveByConnectorId.set(objectItem.id, {
      connectorDraft,
      fromCandidates,
      toCandidates,
      candidateObstacles: nearbyObstacles,
      cachedRoute,
      routeKey,
    });
  });

  const connectorIdsToRecompute = selectConnectorsForRecompute(
    dirtyEntries,
    Math.max(1, CONNECTOR_ROUTE_RECOMPUTE_BUDGET),
  );
  connectorIdsToRecompute.forEach((connectorId) => {
    const context = solveByConnectorId.get(connectorId);
    if (!context) {
      return;
    }

    const resolvedRoute = solveConnectorRoute(context);
    if (!resolvedRoute) {
      return;
    }

    routes.set(connectorId, resolvedRoute);
    setCachedRoute(connectorId, context.routeKey, resolvedRoute);
  });

  cleanupRouteCache(activeConnectorIds);
  return routes;
}

export type { ConnectorRouteResult };
