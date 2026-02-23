import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from "react";
import { useCallback, useMemo } from "react";

import {
  clampScale,
  getAcceleratedWheelZoomDelta,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  ZOOM_BUTTON_STEP_PERCENT,
  ZOOM_WHEEL_INTENSITY,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type { BoardPoint, ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type UseBoardZoomControlsParams = {
  stageRef: MutableRefObject<HTMLDivElement | null>;
  viewportRef: MutableRefObject<ViewportState>;
  setViewport: Dispatch<SetStateAction<ViewportState>>;
};

type UseBoardZoomControlsResult = {
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
  setScaleAtClientPoint: (
    clientX: number,
    clientY: number,
    targetScale: number,
  ) => void;
  zoomAtPointer: (
    clientX: number,
    clientY: number,
    deltaY: number,
  ) => void;
  zoomAtStageCenter: (targetScale: number) => void;
  nudgeZoom: (direction: "in" | "out") => void;
  panByWheel: (deltaX: number, deltaY: number) => void;
  handleWheel: (event: {
    clientX: number;
    clientY: number;
    deltaX: number;
    deltaY: number;
    ctrlKey: boolean;
    metaKey: boolean;
    cancelable: boolean;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) => void;
};

export function useBoardZoomControls({
  stageRef,
  viewportRef,
  setViewport,
}: UseBoardZoomControlsParams): UseBoardZoomControlsResult {
  const toBoardCoordinates = useCallback(
    (clientX: number, clientY: number): BoardPoint | null => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return null;
      }

      const rect = stageElement.getBoundingClientRect();
      return {
        x: (clientX - rect.left - viewportRef.current.x) / viewportRef.current.scale,
        y: (clientY - rect.top - viewportRef.current.y) / viewportRef.current.scale,
      };
    },
    [stageRef, viewportRef],
  );

  const setScaleAtClientPoint = useCallback(
    (clientX: number, clientY: number, targetScale: number) => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      const pointerX = clientX - rect.left;
      const pointerY = clientY - rect.top;
      const current = viewportRef.current;
      const worldX = (pointerX - current.x) / current.scale;
      const worldY = (pointerY - current.y) / current.scale;
      const nextScale = clampScale(targetScale);

      if (nextScale === current.scale) {
        return;
      }

      setViewport({
        x: pointerX - worldX * nextScale,
        y: pointerY - worldY * nextScale,
        scale: nextScale,
      });
    },
    [setViewport, stageRef, viewportRef],
  );

  const zoomAtPointer = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const effectiveDeltaY = getAcceleratedWheelZoomDelta(deltaY);
      const zoomFactor = Math.exp(-effectiveDeltaY * ZOOM_WHEEL_INTENSITY);
      const nextScale = clampScale(viewportRef.current.scale * zoomFactor);
      setScaleAtClientPoint(clientX, clientY, nextScale);
    },
    [setScaleAtClientPoint, viewportRef],
  );

  const zoomAtStageCenter = useCallback(
    (targetScale: number) => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      setScaleAtClientPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
        targetScale,
      );
    },
    [setScaleAtClientPoint, stageRef],
  );

  const nudgeZoom = useCallback(
    (direction: "in" | "out") => {
      const deltaPercent =
        direction === "in" ? ZOOM_BUTTON_STEP_PERCENT : -ZOOM_BUTTON_STEP_PERCENT;
      const nextPercent =
        Math.round(viewportRef.current.scale * 100) + deltaPercent;
      zoomAtStageCenter(nextPercent / 100);
    },
    [viewportRef, zoomAtStageCenter],
  );

  const panByWheel = useCallback(
    (deltaX: number, deltaY: number) => {
      setViewport((previous) => ({
        x: previous.x - deltaX,
        y: previous.y - deltaY,
        scale: previous.scale,
      }));
    },
    [setViewport],
  );

  const handleWheel = useCallback(
    (event: {
      clientX: number;
      clientY: number;
      deltaX: number;
      deltaY: number;
      ctrlKey: boolean;
      metaKey: boolean;
      cancelable: boolean;
      preventDefault: () => void;
      stopPropagation: () => void;
    }) => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      const isInStageBounds =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!isInStageBounds) {
        return;
      }

      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();

      if (event.ctrlKey || event.metaKey) {
        zoomAtPointer(event.clientX, event.clientY, event.deltaY);
      } else {
        panByWheel(event.deltaX, event.deltaY);
      }
    },
    [panByWheel, stageRef, zoomAtPointer],
  );

  return useMemo(
    () => ({
      toBoardCoordinates,
      setScaleAtClientPoint,
      zoomAtPointer,
      zoomAtStageCenter,
      nudgeZoom,
      panByWheel,
      handleWheel,
    }),
    [
      toBoardCoordinates,
      setScaleAtClientPoint,
      zoomAtPointer,
      zoomAtStageCenter,
      nudgeZoom,
      panByWheel,
      handleWheel,
    ],
  );
}
