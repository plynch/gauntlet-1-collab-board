import { useCallback } from "react";
import type {
  Dispatch,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  SetStateAction,
} from "react";

import type { BoardPoint, MarqueeSelectionState, ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { CURSOR_THROTTLE_MS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";

type UseBoardStagePointerEventsParams = {
  setSelectedObjectIds: Dispatch<SetStateAction<string[]>>;
  toBoardCoordinates: (clientX: number, clientY: number) => BoardPoint | null;
  marqueeSelectionStateRef: MutableRefObject<MarqueeSelectionState | null>;
  panStateRef: MutableRefObject<{
    startClientX: number;
    startClientY: number;
    initialX: number;
    initialY: number;
  } | null>;
  viewportRef: MutableRefObject<ViewportState>;
  setMarqueeSelectionState: Dispatch<
    SetStateAction<MarqueeSelectionState | null>
  >;
  setCursorBoardPosition: Dispatch<SetStateAction<BoardPoint | null>>;
  updateCursor: (
    cursor: BoardPoint | null,
    options?: { force?: boolean },
  ) => Promise<void>;
  sendCursorAtRef: MutableRefObject<number>;
};

type UseBoardStagePointerEventsResult = {
  handleStagePointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleStagePointerLeave: () => void;
};

export function useBoardStagePointerEvents(
  params: UseBoardStagePointerEventsParams,
): UseBoardStagePointerEventsResult {
  const {
    setSelectedObjectIds,
    toBoardCoordinates,
    marqueeSelectionStateRef,
    panStateRef,
    viewportRef,
    setMarqueeSelectionState,
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

  return {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
  };
}
