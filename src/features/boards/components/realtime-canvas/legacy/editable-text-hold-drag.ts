import type {
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
} from "react";

import { DRAG_CLICK_SLOP_PX } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  StickyTextHoldDragState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type StartObjectDragFn = (
  objectId: string,
  event: ReactPointerEvent<HTMLElement>,
) => void;

type StartTextHoldDragArgs = {
  objectId: string;
  canEdit: boolean;
  delayMs: number;
  startObjectDrag: StartObjectDragFn;
  clearStickyTextHoldDrag: () => void;
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  event: ReactPointerEvent<HTMLTextAreaElement>;
};

type ContinueTextHoldDragArgs = {
  objectId: string;
  canEdit: boolean;
  startObjectDrag: StartObjectDragFn;
  clearStickyTextHoldDrag: () => void;
  stickyTextHoldDragRef: MutableRefObject<StickyTextHoldDragState | null>;
  event: ReactPointerEvent<HTMLTextAreaElement>;
};

function toSyntheticPointerEvent(
  clientX: number,
  clientY: number,
): ReactPointerEvent<HTMLElement> {
  return {
    button: 0,
    shiftKey: false,
    clientX,
    clientY,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as ReactPointerEvent<HTMLElement>;
}

export function startTextHoldDrag({
  objectId,
  canEdit,
  delayMs,
  startObjectDrag,
  clearStickyTextHoldDrag,
  stickyTextHoldDragRef,
  event,
}: StartTextHoldDragArgs) {
  if (!canEdit || event.button !== 0) {
    clearStickyTextHoldDrag();
    return;
  }

  clearStickyTextHoldDrag();
  const timerId = window.setTimeout(() => {
    const holdState = stickyTextHoldDragRef.current;
    if (!holdState || holdState.objectId !== objectId || holdState.started) {
      return;
    }

    stickyTextHoldDragRef.current = {
      ...holdState,
      started: true,
      timerId: null,
    };
    startObjectDrag(
      objectId,
      toSyntheticPointerEvent(holdState.startClientX, holdState.startClientY),
    );
  }, delayMs);

  stickyTextHoldDragRef.current = {
    objectId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    timerId,
    started: false,
  };
}

export function continueTextHoldDrag({
  objectId,
  canEdit,
  startObjectDrag,
  clearStickyTextHoldDrag,
  stickyTextHoldDragRef,
  event,
}: ContinueTextHoldDragArgs) {
  const holdState = stickyTextHoldDragRef.current;
  if (!holdState || holdState.objectId !== objectId || holdState.started) {
    return;
  }

  if (!canEdit) {
    clearStickyTextHoldDrag();
    return;
  }

  const distance = Math.hypot(
    event.clientX - holdState.startClientX,
    event.clientY - holdState.startClientY,
  );
  if (distance < DRAG_CLICK_SLOP_PX) {
    return;
  }

  if (holdState.timerId !== null) {
    window.clearTimeout(holdState.timerId);
  }

  stickyTextHoldDragRef.current = {
    ...holdState,
    started: true,
    timerId: null,
  };
  event.preventDefault();
  startObjectDrag(
    objectId,
    toSyntheticPointerEvent(event.clientX, event.clientY),
  );
}
