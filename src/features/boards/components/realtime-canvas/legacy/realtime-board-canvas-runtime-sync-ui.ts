"use client";

import { useEffect } from "react";

import { isWriteMetricsDebugEnabled } from "@/features/boards/lib/realtime-write-metrics";
import {
  SNAP_TO_GRID_STORAGE_KEY,
  WRITE_METRICS_LOG_INTERVAL_MS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  AI_FOOTER_HEIGHT_STORAGE_KEY,
} from "@/features/boards/components/realtime-canvas/ai-footer-config";
import type {
  RealtimeBoardCanvasRuntimeSyncProps,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync.types";

export function useRealtimeBoardCanvasRuntimeSyncUi({
  chatMessagesRef,
  chatMessages,
  isAiFooterCollapsed,
  hasAiDrawerBeenInteracted,
  isAiSubmitting,
  setIsAiDrawerNudgeActive,
  boardId,
  aiFooterHeight,
  isSnapToGridEnabled,
  writeMetricsRef,
  stageRef,
  setStageSize,
  stickyTextSyncStateRef,
  refs,
}: RealtimeBoardCanvasRuntimeSyncProps) {
  useEffect(() => {
    const element = chatMessagesRef.current;
    if (!element || isAiFooterCollapsed) {
      return;
    }

    element.scrollTop = element.scrollHeight;
  }, [chatMessages, chatMessagesRef, isAiFooterCollapsed, isAiSubmitting]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !isAiFooterCollapsed ||
      hasAiDrawerBeenInteracted
    ) {
      setIsAiDrawerNudgeActive(false);
      return;
    }

    let nudgeCount = 0;
    let pulseTimeoutId: number | null = null;

    const triggerPulse = () => {
      setIsAiDrawerNudgeActive(true);
      pulseTimeoutId = window.setTimeout(() => {
        setIsAiDrawerNudgeActive(false);
      }, 380);
    };

    triggerPulse();
    const intervalId = window.setInterval(() => {
      nudgeCount += 1;
      if (nudgeCount >= 6) {
        window.clearInterval(intervalId);
        return;
      }
      triggerPulse();
    }, 2_800);

    return () => {
      window.clearInterval(intervalId);
      if (pulseTimeoutId !== null) {
        window.clearTimeout(pulseTimeoutId);
      }
      setIsAiDrawerNudgeActive(false);
    };
  }, [
    hasAiDrawerBeenInteracted,
    isAiFooterCollapsed,
    setIsAiDrawerNudgeActive,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      AI_FOOTER_HEIGHT_STORAGE_KEY,
      String(aiFooterHeight),
    );
  }, [aiFooterHeight]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SNAP_TO_GRID_STORAGE_KEY,
      isSnapToGridEnabled ? "1" : "0",
    );
  }, [isSnapToGridEnabled]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" || !isWriteMetricsDebugEnabled()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const snapshot = writeMetricsRef.current.snapshot();
      console.info(`[realtime-write-metrics][board:${boardId}]`, snapshot);
    }, WRITE_METRICS_LOG_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [boardId, writeMetricsRef]);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const syncStageSize = () => {
      setStageSize({
        width: stageElement.clientWidth,
        height: stageElement.clientHeight,
      });
    };

    syncStageSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncStageSize);
      return () => {
        window.removeEventListener("resize", syncStageSize);
      };
    }

    const resizeObserver = new ResizeObserver(() => {
      syncStageSize();
    });
    resizeObserver.observe(stageElement);

    return () => {
      resizeObserver.disconnect();
    };
  }, [setStageSize, stageRef]);

  useEffect(() => {
    const syncStates = stickyTextSyncStateRef.current;
    const gridSyncTimers = refs.gridContentSyncTimerByIdRef.current;

    return () => {
      syncStates.forEach((syncState) => {
        if (syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
        }
      });
      syncStates.clear();
      gridSyncTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
      gridSyncTimers.clear();
    };
  }, [refs.gridContentSyncTimerByIdRef, stickyTextSyncStateRef]);

  useEffect(() => {
    return () => {
      if (refs.boardStatusTimerRef.current !== null) {
        window.clearTimeout(refs.boardStatusTimerRef.current);
        refs.boardStatusTimerRef.current = null;
      }
    };
  }, [refs.boardStatusTimerRef]);
}
