import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type {
  BoardObject,
  ConnectorAnchor,
} from "@/features/boards/types";
import {
  isConnectableShapeKind,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  CONNECTOR_MIN_SEGMENT_SIZE,
  getAnchorDirectionForGeometry,
  getAnchorPointForGeometry,
  type ResolvedConnectorEndpoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type {
  BoardPoint,
  ConnectorDraft,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type UseDraftGeometryAndConnectorsArgs = {
  draftGeometryByIdRef: MutableRefObject<Record<string, ObjectGeometry>>;
  draftConnectorByIdRef: MutableRefObject<Record<string, ConnectorDraft>>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  setDraftGeometryById: Dispatch<SetStateAction<Record<string, ObjectGeometry>>>;
  setDraftConnectorById: Dispatch<SetStateAction<Record<string, ConnectorDraft>>>;
};

export function useDraftGeometryAndConnectors({
  draftGeometryByIdRef,
  draftConnectorByIdRef,
  objectsByIdRef,
  setDraftGeometryById,
  setDraftConnectorById,
}: UseDraftGeometryAndConnectorsArgs) {
  const getCurrentObjectGeometry = useCallback(
    (objectId: string): ObjectGeometry | null => {
      const draftGeometry = draftGeometryByIdRef.current[objectId];
      if (draftGeometry) {
        return draftGeometry;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem) {
        return null;
      }

      return {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
    },
    [draftGeometryByIdRef, objectsByIdRef],
  );

  const setDraftGeometry = useCallback(
    (objectId: string, geometry: ObjectGeometry) => {
      setDraftGeometryById((previous) => ({
        ...previous,
        [objectId]: geometry,
      }));
    },
    [setDraftGeometryById],
  );

  const clearDraftGeometry = useCallback(
    (objectId: string) => {
      setDraftGeometryById((previous) => {
        if (!(objectId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[objectId];
        return next;
      });
    },
    [setDraftGeometryById],
  );

  const setDraftConnector = useCallback(
    (objectId: string, draft: ConnectorDraft) => {
      setDraftConnectorById((previous) => ({
        ...previous,
        [objectId]: draft,
      }));
    },
    [setDraftConnectorById],
  );

  const clearDraftConnector = useCallback(
    (objectId: string) => {
      setDraftConnectorById((previous) => {
        if (!(objectId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[objectId];
        return next;
      });
    },
    [setDraftConnectorById],
  );

  const getConnectorDraftForObject = useCallback(
    (objectItem: BoardObject): ConnectorDraft | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const draft = draftConnectorByIdRef.current[objectItem.id];
      if (draft) {
        return draft;
      }

      const objectGeometry = getCurrentObjectGeometry(objectItem.id);
      const fallbackGeometry: ObjectGeometry = objectGeometry ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };

      const defaultFromX =
        objectItem.fromX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.1;
      const defaultFromY =
        objectItem.fromY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;
      const defaultToX =
        objectItem.toX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.9;
      const defaultToY =
        objectItem.toY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;

      return {
        fromObjectId: objectItem.fromObjectId ?? null,
        toObjectId: objectItem.toObjectId ?? null,
        fromAnchor: objectItem.fromAnchor ?? null,
        toAnchor: objectItem.toAnchor ?? null,
        fromX: defaultFromX,
        fromY: defaultFromY,
        toX: defaultToX,
        toY: defaultToY,
      };
    },
    [draftConnectorByIdRef, getCurrentObjectGeometry],
  );

  const resolveConnectorEndpoint = useCallback(
    (
      objectId: string | null,
      anchor: ConnectorAnchor | null,
      fallbackPoint: BoardPoint,
    ): ResolvedConnectorEndpoint => {
      if (!objectId || !anchor) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorObject = objectsByIdRef.current.get(objectId);
      if (!anchorObject || !isConnectableShapeKind(anchorObject.type)) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorPoint = getAnchorPointForGeometry(
        geometry,
        anchor,
        anchorObject.type,
      );
      return {
        x: anchorPoint.x,
        y: anchorPoint.y,
        objectId,
        anchor,
        direction: getAnchorDirectionForGeometry(anchor, geometry),
        connected: true,
      };
    },
    [getCurrentObjectGeometry, objectsByIdRef],
  );

  const getResolvedConnectorEndpoints = useCallback(
    (
      objectItem: BoardObject,
    ): {
      from: ResolvedConnectorEndpoint;
      to: ResolvedConnectorEndpoint;
      draft: ConnectorDraft;
    } | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const connectorDraft = getConnectorDraftForObject(objectItem);
      if (!connectorDraft) {
        return null;
      }

      const from = resolveConnectorEndpoint(
        connectorDraft.fromObjectId,
        connectorDraft.fromAnchor,
        {
          x: connectorDraft.fromX,
          y: connectorDraft.fromY,
        },
      );
      const to = resolveConnectorEndpoint(
        connectorDraft.toObjectId,
        connectorDraft.toAnchor,
        {
          x: connectorDraft.toX,
          y: connectorDraft.toY,
        },
      );

      return {
        from,
        to,
        draft: connectorDraft,
      };
    },
    [getConnectorDraftForObject, resolveConnectorEndpoint],
  );

  return {
    getCurrentObjectGeometry,
    setDraftGeometry,
    clearDraftGeometry,
    setDraftConnector,
    clearDraftConnector,
    getConnectorDraftForObject,
    resolveConnectorEndpoint,
    getResolvedConnectorEndpoints,
  };
}
