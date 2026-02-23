"use client";

import { useEffect } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";

type SelectionHudSize = { width: number; height: number };

type UseSelectionHudSizeSyncProps = {
  canShowSelectionHud: boolean;
  selectionHudRef: RefObject<HTMLDivElement | null>;
  setSelectionHudSize: Dispatch<SetStateAction<SelectionHudSize>>;
};

export function useSelectionHudSizeSync({
  canShowSelectionHud,
  selectionHudRef,
  setSelectionHudSize,
}: UseSelectionHudSizeSyncProps): void {
  useEffect(() => {
    if (!canShowSelectionHud) {
      setSelectionHudSize((previous) =>
        previous.width === 0 && previous.height === 0
          ? previous
          : { width: 0, height: 0 },
      );
      return;
    }

    const hudElement = selectionHudRef.current;
    if (!hudElement) {
      return;
    }

    const syncHudSize = () => {
      const nextWidth = hudElement.offsetWidth;
      const nextHeight = hudElement.offsetHeight;
      setSelectionHudSize((previous) =>
        previous.width === nextWidth && previous.height === nextHeight
          ? previous
          : { width: nextWidth, height: nextHeight },
      );
    };

    syncHudSize();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      syncHudSize();
    });
    resizeObserver.observe(hudElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canShowSelectionHud, selectionHudRef, setSelectionHudSize]);
}
