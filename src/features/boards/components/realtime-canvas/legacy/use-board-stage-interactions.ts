import { useCallback } from "react";
import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type {
  BoardPoint,
  ConnectorDraft,
  DragState,
  LineEndpoint,
  MarqueeSelectionState,
  ObjectGeometry,
  PanState,
  ResizeCorner,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  isConnectableShapeKind,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  getLineEndpoints,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import { toDegrees } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
import type { BoardObject } from "@/features/boards/types";
import type {
  ConnectorEndpointDragState,
  CornerResizeState,
  LineEndpointResizeState,
  RotateState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { CURSOR_THROTTLE_MS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";

type UseBoardStageInteractionsParams = {
  canEdit: boolean;
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
  marqueeSelectionStateRef: MutableRefObject<MarqueeSelectionState | null>;
  panStateRef: MutableRefObject<PanState | null>;
  viewportRef: MutableRefObject<ViewportState>;
  objectsByIdRef: MutableRefObject<Map<string, BoardObject>>;
  selectedObjectIdsRef: MutableRefObject<Set<string>>;
  getCurrentObjectGeometry: (objectId: string) => ObjectGeometry | null;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  dragStateRef: MutableRefObject<DragState | null>;
  setIsObjectDragging: Dispatch<SetStateAction<boolean>>;
  setMarqueeSelectionState: Dispatch<SetStateAction<MarqueeSelectionState | null>>;
  rotateStateRef: MutableRefObject<RotateState | null>;
  cornerResizeStateRef: MutableRefObject<CornerResizeState | null>;
  lineEndpointResizeStateRef: MutableRefObject<LineEndpointResizeState | null>;
  connectorEndpointDragStateRef: MutableRefObject<ConnectorEndpointDragState | null>;
  setDraftConnector: (objectId: string, draft: ConnectorDraft) => void;
  getConnectorDraftForObject: (objectItem: BoardObject) => ConnectorDraft | null;
  setCursorBoardPosition: Dispatch<SetStateAction<BoardPoint | null>>;
  updateCursor: (cursor: BoardPoint | null, options?: { force?: boolean }) => Promise<void>;
  sendCursorAtRef: MutableRefObject<number>;
};

type UseBoardStageInteractionsResult = {
  handleStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
  startObjectDrag: (objectId: string, event: ReactPointerEvent<HTMLElement>) => void;
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

export function useBoardStageInteractions(
  params: UseBoardStageInteractionsParams,
): UseBoardStageInteractionsResult {
  const {
    canEdit,
    setSelectedObjectIds,
  toBoardCoordinates,
  marqueeSelectionStateRef,
  panStateRef,
  viewportRef,
  setMarqueeSelectionState,
  objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef,
  } = params;

  const handleStagePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest("[data-selection-hud='true']")) {
        return;
      }

      if (target.closest("[data-board-object='true']")) {
        return;
      }

      const isRemoveMarquee = event.ctrlKey || event.metaKey;
      const isAddMarquee = event.shiftKey;

      if (isAddMarquee || isRemoveMarquee) {
        const startPoint = toBoardCoordinates(event.clientX, event.clientY);
        if (!startPoint) {
          return;
        }

      const nextMarqueeState: MarqueeSelectionState = {
        startPoint,
        currentPoint: startPoint,
        mode: isRemoveMarquee ? "remove" : "add",
      };

      marqueeSelectionStateRef.current = nextMarqueeState;
      setMarqueeSelectionState(nextMarqueeState);
      return;
    }

      setSelectedObjectIds([]);
      panStateRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialX: viewportRef.current.x,
        initialY: viewportRef.current.y,
      };
    },
    [
      marqueeSelectionStateRef,
      panStateRef,
      setMarqueeSelectionState,
      setSelectedObjectIds,
      toBoardCoordinates,
      viewportRef,
    ],
  );

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const nextPoint = toBoardCoordinates(event.clientX, event.clientY);
      if (nextPoint) {
        setCursorBoardPosition((previous) => {
          const nextRounded = {
            x: Math.round(nextPoint.x),
            y: Math.round(nextPoint.y),
          };
          if (
            previous &&
            previous.x === nextRounded.x &&
            previous.y === nextRounded.y
          ) {
            return previous;
          }
          return nextRounded;
        });
      }

      const now = Date.now();
      if (now - sendCursorAtRef.current < CURSOR_THROTTLE_MS) {
        return;
      }

      sendCursorAtRef.current = now;
      if (!nextPoint) {
        return;
      }

      void updateCursor(nextPoint);
    },
    [sendCursorAtRef, setCursorBoardPosition, toBoardCoordinates, updateCursor],
  );

  const handleStagePointerLeave = useCallback(() => {
    setCursorBoardPosition(null);
    void updateCursor(null, { force: true });
  }, [setCursorBoardPosition, updateCursor]);

  const startObjectDrag = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!canEdit || event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.shiftKey) {
        toggleObjectSelection(objectId);
        return;
      }

      const sourceObject = objectsByIdRef.current.get(objectId);
      if (sourceObject && isConnectorKind(sourceObject.type)) {
        selectSingleObject(objectId);
        return;
      }

      const currentSelectedIds = selectedObjectIdsRef.current;
      const shouldPrepareGroupDrag =
        currentSelectedIds.has(objectId) && currentSelectedIds.size > 1;
      const dragObjectIds = (
        shouldPrepareGroupDrag ? Array.from(currentSelectedIds) : [objectId]
      ).filter((candidateId) => {
        const candidateObject = objectsByIdRef.current.get(candidateId);
        return candidateObject ? !isConnectorKind(candidateObject.type) : false;
      });

      if (!shouldPrepareGroupDrag) {
        selectSingleObject(objectId);
      }

      const initialGeometries: Record<string, ObjectGeometry> = {};
      dragObjectIds.forEach((candidateId) => {
        const geometry = getCurrentObjectGeometry(candidateId);
        if (geometry) {
          initialGeometries[candidateId] = geometry;
        }
      });

      const availableObjectIds = Object.keys(initialGeometries);
      if (availableObjectIds.length === 0) {
        return;
      }

      setIsObjectDragging(true);
      dragStateRef.current = {
        objectIds: availableObjectIds,
        initialGeometries,
        startClientX: event.clientX,
        startClientY: event.clientY,
        lastSentAt: 0,
        hasMoved: false,
        collapseToObjectIdOnClick: shouldPrepareGroupDrag
          ? null
          : objectId,
      };
    },
    [
      canEdit,
      dragStateRef,
      getCurrentObjectGeometry,
      objectsByIdRef,
      selectSingleObject,
      selectedObjectIdsRef,
      setIsObjectDragging,
      toggleObjectSelection,
    ],
  );

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
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  };
}
