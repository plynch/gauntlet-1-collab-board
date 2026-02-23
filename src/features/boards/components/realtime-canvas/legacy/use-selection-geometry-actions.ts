"use client";

import { useCallback } from "react";
import type { MutableRefObject } from "react";

import {
  isConnectableShapeKind,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  CONNECTOR_ANCHORS,
  getAnchorPointForGeometry,
  getConnectorHitBounds,
  getObjectVisualBounds,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { CONNECTOR_HIT_PADDING } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ObjectGeometry } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { BoardObject, ConnectorAnchor } from "@/features/boards/types";

type ResolvedConnectorEndpoints = {
  from: {
    connected: boolean;
    objectId: string | null;
    anchor: ConnectorAnchor | null;
    x: number;
    y: number;
  };
  to: {
    connected: boolean;
    objectId: string | null;
    anchor: ConnectorAnchor | null;
    x: number;
    y: number;
  };
};

type UseSelectionGeometryActionsProps = {
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  getResolvedConnectorEndpoints: (
    objectItem: BoardObject,
  ) => ResolvedConnectorEndpoints | null;
};

export function useSelectionGeometryActions({
  objectsByIdRef,
  getCurrentObjectGeometry,
  getResolvedConnectorEndpoints,
}: UseSelectionGeometryActionsProps) {
  const getObjectSelectionBounds = useCallback(
    (objectItem: BoardObject) => {
      if (isConnectorKind(objectItem.type)) {
        const resolved = getResolvedConnectorEndpoints(objectItem);
        if (resolved) {
          return getConnectorHitBounds(
            resolved.from,
            resolved.to,
            CONNECTOR_HIT_PADDING,
          );
        }
      }

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return {
          left: objectItem.x,
          right: objectItem.x + objectItem.width,
          top: objectItem.y,
          bottom: objectItem.y + objectItem.height,
        };
      }

      return getObjectVisualBounds(objectItem.type, geometry);
    },
    [getCurrentObjectGeometry, getResolvedConnectorEndpoints],
  );

  const getObjectsIntersectingRect = useCallback(
    (rect: { left: number; right: number; top: number; bottom: number }) => {
      const intersectingObjectIds: string[] = [];

      objectsByIdRef.current.forEach((objectItem) => {
        const bounds = getObjectSelectionBounds(objectItem);
        const intersects =
          bounds.right >= rect.left &&
          bounds.left <= rect.right &&
          bounds.bottom >= rect.top &&
          bounds.top <= rect.bottom;

        if (intersects) {
          intersectingObjectIds.push(objectItem.id);
        }
      });

      return intersectingObjectIds;
    },
    [getObjectSelectionBounds, objectsByIdRef],
  );

  const getConnectableAnchorPoints = useCallback(() => {
    const anchors: Array<{
      objectId: string;
      anchor: ConnectorAnchor;
      x: number;
      y: number;
    }> = [];

    objectsByIdRef.current.forEach((objectItem) => {
      if (!isConnectableShapeKind(objectItem.type)) {
        return;
      }
      const connectableType = objectItem.type;

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return;
      }

      CONNECTOR_ANCHORS.forEach((anchor) => {
        const point = getAnchorPointForGeometry(
          geometry,
          anchor,
          connectableType,
        );
        anchors.push({
          objectId: objectItem.id,
          anchor,
          x: point.x,
          y: point.y,
        });
      });
    });

    return anchors;
  }, [getCurrentObjectGeometry, objectsByIdRef]);

  return {
    getObjectSelectionBounds,
    getObjectsIntersectingRect,
    getConnectableAnchorPoints,
  };
}
