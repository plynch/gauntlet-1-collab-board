import { useMemo } from "react";

import type { BoardObject, BoardObjectKind } from "@/features/boards/types";
import {
  canUseSelectionHudColor,
  isConnectableShapeKind,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { CONNECTOR_VIEWPORT_CULL_PADDING_PX } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  getObjectVisualBounds,
  inflateObjectBounds,
  mergeBounds,
  type ConnectorRoutingObstacle,
  type ObjectBounds,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { computeConnectorRoutes } from "@/features/boards/components/realtime-canvas/legacy/connector-route-runtime";
import type {
  ConnectorDraft,
  ConnectorEndpointDragState,
  ObjectGeometry,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type ConnectableShapeKind = Exclude<
  BoardObjectKind,
  "line" | "connectorUndirected" | "connectorArrow" | "connectorBidirectional"
>;

export type SelectedObjectEntry = {
  object: BoardObject;
  geometry: ObjectGeometry;
};

type UseBoardSelectionAndConnectorsOptions = {
  objects: BoardObject[];
  draftGeometryById: Record<string, ObjectGeometry>;
  draftConnectorById: Record<string, ConnectorDraft>;
  selectedObjectIds: string[];
  stageSize: { width: number; height: number };
  viewport: ViewportState;
  activeEndpointDrag: ConnectorEndpointDragState | null;
};

export function useBoardSelectionAndConnectors(
  options: UseBoardSelectionAndConnectorsOptions,
) {
  const selectedObjects = useMemo(
    () =>
      options.selectedObjectIds
        .map((objectId) => {
          const objectItem = options.objects.find((item) => item.id === objectId);
          if (!objectItem) {
            return null;
          }

          const draftGeometry = options.draftGeometryById[objectId];
          const geometry: ObjectGeometry = draftGeometry ?? {
            x: objectItem.x,
            y: objectItem.y,
            width: objectItem.width,
            height: objectItem.height,
            rotationDeg: objectItem.rotationDeg,
          };

          return {
            object: objectItem,
            geometry,
          };
        })
        .filter((item): item is SelectedObjectEntry => item !== null),
    [options.draftGeometryById, options.objects, options.selectedObjectIds],
  );

  const connectableGeometryById = useMemo(() => {
    const geometries = new Map<string, ObjectGeometry>();
    options.objects.forEach((objectItem) => {
      if (!isConnectableShapeKind(objectItem.type)) {
        return;
      }

      const draftGeometry = options.draftGeometryById[objectItem.id];
      geometries.set(
        objectItem.id,
        draftGeometry ?? {
          x: objectItem.x,
          y: objectItem.y,
          width: objectItem.width,
          height: objectItem.height,
          rotationDeg: objectItem.rotationDeg,
        },
      );
    });
    return geometries;
  }, [options.draftGeometryById, options.objects]);

  const connectableTypeById = useMemo(() => {
    const types = new Map<string, ConnectableShapeKind>();
    options.objects.forEach((objectItem) => {
      if (isConnectableShapeKind(objectItem.type)) {
        types.set(objectItem.id, objectItem.type);
      }
    });
    return types;
  }, [options.objects]);

  const connectorRoutingObstacles = useMemo(
    () =>
      Array.from(connectableGeometryById.entries())
        .map(([objectId, geometry]) => {
          const objectType = connectableTypeById.get(objectId);
          if (!objectType) {
            return null;
          }

          return {
            objectId,
            bounds: inflateObjectBounds(
              getObjectVisualBounds(objectType, geometry),
              14,
            ),
          };
        })
        .filter((item): item is ConnectorRoutingObstacle => item !== null),
    [connectableGeometryById, connectableTypeById],
  );

  const connectorViewportBounds = useMemo<ObjectBounds | null>(() => {
    if (
      options.stageSize.width <= 0 ||
      options.stageSize.height <= 0 ||
      options.viewport.scale <= 0 ||
      !Number.isFinite(options.viewport.scale)
    ) {
      return null;
    }

    const worldPadding =
      CONNECTOR_VIEWPORT_CULL_PADDING_PX / Math.max(options.viewport.scale, 0.1);
    const left = (-options.viewport.x) / options.viewport.scale - worldPadding;
    const right =
      (options.stageSize.width - options.viewport.x) / options.viewport.scale +
      worldPadding;
    const top = (-options.viewport.y) / options.viewport.scale - worldPadding;
    const bottom =
      (options.stageSize.height - options.viewport.y) / options.viewport.scale +
      worldPadding;

    return {
      left: Math.min(left, right),
      right: Math.max(left, right),
      top: Math.min(top, bottom),
      bottom: Math.max(top, bottom),
    };
  }, [
    options.stageSize.height,
    options.stageSize.width,
    options.viewport.scale,
    options.viewport.x,
    options.viewport.y,
  ]);

  const selectedConnectorIds = useMemo(() => {
    const ids = new Set<string>();
    selectedObjects.forEach((selectedObject) => {
      if (isConnectorKind(selectedObject.object.type)) {
        ids.add(selectedObject.object.id);
      }
    });
    return ids;
  }, [selectedObjects]);

  const connectorRoutesById = useMemo(
    () =>
      computeConnectorRoutes({
        objects: options.objects,
        draftConnectorById: options.draftConnectorById,
        draftGeometryById: options.draftGeometryById,
        connectableGeometryById,
        connectableTypeById,
        connectorRoutingObstacles,
        connectorViewportBounds,
        selectedConnectorIds,
        activeEndpointDrag: options.activeEndpointDrag,
      }),
    [
      connectableGeometryById,
      connectableTypeById,
      connectorRoutingObstacles,
      connectorViewportBounds,
      options.activeEndpointDrag,
      options.draftConnectorById,
      options.draftGeometryById,
      options.objects,
      selectedConnectorIds,
    ],
  );

  const selectedObjectBounds = useMemo(
    () =>
      mergeBounds(
        selectedObjects.map((selectedObject) => {
          if (isConnectorKind(selectedObject.object.type)) {
            const routed = connectorRoutesById.get(selectedObject.object.id);
            if (routed) {
              return routed.geometry.bounds;
            }
          }

          return getObjectVisualBounds(
            selectedObject.object.type,
            selectedObject.geometry,
          );
        }),
      ),
    [connectorRoutesById, selectedObjects],
  );

  const selectedConnectorMidpoint = useMemo(() => {
    if (selectedObjects.length !== 1) {
      return null;
    }

    const selectedObject = selectedObjects[0];
    if (!selectedObject || !isConnectorKind(selectedObject.object.type)) {
      return null;
    }

    const routed = connectorRoutesById.get(selectedObject.object.id);
    if (!routed) {
      return null;
    }

    return routed.geometry.midPoint;
  }, [connectorRoutesById, selectedObjects]);

  const selectedColorableObjects = useMemo(
    () => selectedObjects.filter((item) => canUseSelectionHudColor(item.object)),
    [selectedObjects],
  );

  const selectedColor = useMemo(() => {
    if (selectedColorableObjects.length === 0) {
      return null;
    }

    const [firstItem, ...rest] = selectedColorableObjects;
    if (!firstItem) {
      return null;
    }

    return rest.every((item) => item.object.color === firstItem.object.color)
      ? firstItem.object.color
      : null;
  }, [selectedColorableObjects]);

  return {
    connectorRoutesById,
    selectedObjects,
    selectedObjectBounds,
    selectedConnectorMidpoint,
    selectedColorableObjects,
    selectedColor,
  };
}
