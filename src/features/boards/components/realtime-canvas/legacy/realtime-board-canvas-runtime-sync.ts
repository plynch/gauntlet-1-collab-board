"use client";

import { useRealtimeBoardCanvasRuntimeSyncState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync-state";
import { useRealtimeBoardCanvasRuntimeSyncUi } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync-ui";
import type {
  RealtimeBoardCanvasRuntimeSyncProps,
  RealtimeBoardCanvasRuntimeSyncResult,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync.types";

export function useRealtimeBoardCanvasRuntimeSync({
  ...props
}: RealtimeBoardCanvasRuntimeSyncProps): RealtimeBoardCanvasRuntimeSyncResult {
  const { clearStickyTextHoldDrag } =
    useRealtimeBoardCanvasRuntimeSyncState(props);

  useRealtimeBoardCanvasRuntimeSyncUi(props);

  return {
    clearStickyTextHoldDrag,
  };
}
