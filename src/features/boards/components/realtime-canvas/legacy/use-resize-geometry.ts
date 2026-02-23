import { useCallback, type MutableRefObject } from "react";

import {
  getMinimumObjectSize,
  LINE_MIN_LENGTH,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  isSnapEligibleObjectType,
  snapToGrid,
  toDegrees,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import type {
  BoardPoint,
  CornerResizeState,
  LineEndpointResizeState,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type UseResizeGeometryArgs = {
  snapToGridEnabledRef: MutableRefObject<boolean>;
};

export function useResizeGeometry({
  snapToGridEnabledRef,
}: UseResizeGeometryArgs) {
  const getResizedGeometry = useCallback(
    (
      state: CornerResizeState,
      clientX: number,
      clientY: number,
      scale: number,
    ): ObjectGeometry => {
      const deltaX = (clientX - state.startClientX) / scale;
      const deltaY = (clientY - state.startClientY) / scale;

      const minimumSize = getMinimumObjectSize(state.objectType);
      let nextX = state.initialGeometry.x;
      let nextY = state.initialGeometry.y;
      let nextWidth = state.initialGeometry.width;
      let nextHeight = state.initialGeometry.height;

      if (state.corner === "nw") {
        nextX = state.initialGeometry.x + deltaX;
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "ne") {
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "sw") {
        nextX = state.initialGeometry.x + deltaX;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      } else {
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      }

      if (nextWidth < minimumSize.width) {
        const deficit = minimumSize.width - nextWidth;
        nextWidth = minimumSize.width;
        if (state.corner === "nw" || state.corner === "sw") {
          nextX -= deficit;
        }
      }

      if (nextHeight < minimumSize.height) {
        const deficit = minimumSize.height - nextHeight;
        nextHeight = minimumSize.height;
        if (state.corner === "nw" || state.corner === "ne") {
          nextY -= deficit;
        }
      }

      if (state.objectType === "circle") {
        const size = Math.max(
          minimumSize.width,
          Math.max(nextWidth, nextHeight),
        );
        if (state.corner === "nw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "ne") {
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "sw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
        }

        nextWidth = size;
        nextHeight = size;
      }

      if (
        snapToGridEnabledRef.current &&
        isSnapEligibleObjectType(state.objectType)
      ) {
        const initialRight = state.initialGeometry.x + state.initialGeometry.width;
        const initialBottom =
          state.initialGeometry.y + state.initialGeometry.height;

        if (state.objectType === "circle") {
          const snappedSize = Math.max(minimumSize.width, snapToGrid(nextWidth));
          nextWidth = snappedSize;
          nextHeight = snappedSize;

          if (state.corner === "nw") {
            nextX = initialRight - snappedSize;
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "ne") {
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "sw") {
            nextX = initialRight - snappedSize;
          }
        } else {
          const snappedWidth = Math.max(minimumSize.width, snapToGrid(nextWidth));
          const snappedHeight = Math.max(
            minimumSize.height,
            snapToGrid(nextHeight),
          );

          if (state.corner === "nw" || state.corner === "sw") {
            nextX = initialRight - snappedWidth;
          }
          if (state.corner === "nw" || state.corner === "ne") {
            nextY = initialBottom - snappedHeight;
          }

          nextWidth = snappedWidth;
          nextHeight = snappedHeight;
        }
      }

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        rotationDeg: state.initialGeometry.rotationDeg,
      };
    },
    [snapToGridEnabledRef],
  );

  const getLineGeometryFromEndpointDrag = useCallback(
    (
      state: LineEndpointResizeState,
      movingPoint: BoardPoint,
    ): ObjectGeometry => {
      const dx = movingPoint.x - state.fixedPoint.x;
      const dy = movingPoint.y - state.fixedPoint.y;
      const distance = Math.hypot(dx, dy);
      const length = Math.max(LINE_MIN_LENGTH, distance);
      const angle = distance < 0.001 ? 0 : toDegrees(Math.atan2(dy, dx));

      const normalizedX = distance < 0.001 ? 1 : dx / distance;
      const normalizedY = distance < 0.001 ? 0 : dy / distance;
      const adjustedMovingPoint = {
        x: state.fixedPoint.x + normalizedX * length,
        y: state.fixedPoint.y + normalizedY * length,
      };

      const startPoint =
        state.endpoint === "start" ? adjustedMovingPoint : state.fixedPoint;
      const endPoint =
        state.endpoint === "end" ? adjustedMovingPoint : state.fixedPoint;
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;

      return {
        x: centerX - length / 2,
        y: centerY - state.handleHeight / 2,
        width: length,
        height: state.handleHeight,
        rotationDeg: angle,
      };
    },
    [],
  );

  return {
    getResizedGeometry,
    getLineGeometryFromEndpointDrag,
  };
}
