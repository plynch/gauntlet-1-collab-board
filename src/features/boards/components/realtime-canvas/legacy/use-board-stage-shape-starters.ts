import { useCallback } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RefObject, MutableRefObject } from "react";

import type { BoardPoint, ObjectGeometry } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  isConnectableShapeKind,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { getLineEndpoints } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { toDegrees } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
import type { BoardObject } from "@/features/boards/types";
import type {
  ConnectorDraft,
  ConnectorEndpointDragState,
  CornerResizeState,
  LineEndpoint,
  LineEndpointResizeState,
  RotateState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { ResizeCorner } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type UseBoardShapeStartersParams = {
  canEdit: boolean;
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
  objectsByIdRef: RefObject<Map<string, BoardObject>>;
  selectSingleObject: (objectId: string) => void;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  rotateStateRef: MutableRefObject<RotateState | null>;
  cornerResizeStateRef: MutableRefObject<CornerResizeState | null>;
  lineEndpointResizeStateRef: MutableRefObject<LineEndpointResizeState | null>;
  connectorEndpointDragStateRef: MutableRefObject<ConnectorEndpointDragState | null>;
  setDraftConnector: (objectId: string, draft: ConnectorDraft) => void;
  getConnectorDraftForObject: (objectItem: BoardObject) => ConnectorDraft | null;
};

type UseBoardShapeStartersResult = {
  startShapeRotate: (objectId: string, event: ReactPointerEvent<HTMLButtonElement>) => void;
  startCornerResize: (
    objectId: string,
    corner: ResizeCorner,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startLineEndpointResize: (
    objectId: string,
    endpoint: LineEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  startConnectorEndpointDrag: (
    objectId: string,
    endpoint: "from" | "to",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

export function useBoardShapeStarters(
  params: UseBoardShapeStartersParams,
): UseBoardShapeStartersResult {
  const {
    canEdit,
    toBoardCoordinates,
    objectsByIdRef,
    selectSingleObject,
    getCurrentObjectGeometry,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
  } = params;

  const startShapeRotate = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (
        !objectItem ||
        !isConnectableShapeKind(objectItem.type) ||
        objectItem.type === "gridContainer"
      ) {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      const pointer = toBoardCoordinates(event.clientX, event.clientY);
      if (!pointer) {
        return;
      }

      const centerPoint = {
        x: geometry.x + geometry.width / 2,
        y: geometry.y + geometry.height / 2,
      };
      const initialPointerAngleDeg = toDegrees(
        Math.atan2(pointer.y - centerPoint.y, pointer.x - centerPoint.x),
      );

      selectSingleObject(objectId);
      rotateStateRef.current = {
        objectId,
        centerPoint,
        initialPointerAngleDeg,
        initialRotationDeg: geometry.rotationDeg,
        lastSentAt: 0,
      };
    },
    [
      canEdit,
      getCurrentObjectGeometry,
      objectsByIdRef,
      rotateStateRef,
      selectSingleObject,
      toBoardCoordinates,
    ],
  );

  const startCornerResize = useCallback(
    (
      objectId: string,
      corner: ResizeCorner,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isConnectableShapeKind(objectItem.type)) {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      selectSingleObject(objectId);
      cornerResizeStateRef.current = {
        objectId,
        objectType: objectItem.type,
        corner,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialGeometry: geometry,
        lastSentAt: 0,
      };
    },
    [
      canEdit,
      cornerResizeStateRef,
      getCurrentObjectGeometry,
      objectsByIdRef,
      selectSingleObject,
    ],
  );

  const startLineEndpointResize = useCallback(
    (
      objectId: string,
      endpoint: LineEndpoint,
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "line") {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      const endpoints = getLineEndpoints(geometry);
      const fixedPoint = endpoint === "start" ? endpoints.end : endpoints.start;

      selectSingleObject(objectId);
      lineEndpointResizeStateRef.current = {
        objectId,
        endpoint,
        fixedPoint,
        handleHeight: geometry.height,
        lastSentAt: 0,
      };
    },
    [
      canEdit,
      getCurrentObjectGeometry,
      lineEndpointResizeStateRef,
      objectsByIdRef,
      selectSingleObject,
    ],
  );

  const startConnectorEndpointDrag = useCallback(
    (
      objectId: string,
      endpoint: "from" | "to",
      event: ReactPointerEvent<HTMLButtonElement>,
    ) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || !isConnectorKind(objectItem.type)) {
        return;
      }

      const currentDraft = getConnectorDraftForObject(objectItem);
      if (!currentDraft) {
        return;
      }

      setDraftConnector(objectId, currentDraft);
      selectSingleObject(objectId);
      connectorEndpointDragStateRef.current = {
        objectId,
        endpoint,
        lastSentAt: 0,
      };
    },
    [
      canEdit,
      connectorEndpointDragStateRef,
      getConnectorDraftForObject,
      objectsByIdRef,
      selectSingleObject,
      setDraftConnector,
    ],
  );

  return {
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  };
}
