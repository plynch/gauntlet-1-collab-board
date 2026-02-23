import { useEffect, useRef } from "react";

import { handleBoardStageWindowPointerMove } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-move";
import { handleBoardStageWindowPointerUp } from "@/features/boards/components/realtime-canvas/legacy/board-stage-window-pointer-up";
import type { UseBoardStageWindowPointerEventsParams } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events.types";

export function useBoardStageWindowPointerEvents(
  params: UseBoardStageWindowPointerEventsParams,
): void {
  const paramsRef = useRef(params);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) =>
      handleBoardStageWindowPointerMove(event, paramsRef.current);
    const handleWindowPointerUp = (event: PointerEvent) =>
      handleBoardStageWindowPointerUp(event, paramsRef.current);

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, []);
}
