"use client";

import { useCallback, useEffect } from "react";

import { SNAP_TO_GRID_STORAGE_KEY } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import {
  AI_FOOTER_HEIGHT_STORAGE_KEY,
  clampAiFooterHeight,
} from "@/features/boards/components/realtime-canvas/ai-footer-config";
import type {
  RealtimeBoardCanvasRuntimeSyncProps,
  RealtimeBoardCanvasRuntimeSyncResult,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync.types";

export function useRealtimeBoardCanvasRuntimeSyncState({
  canEdit,
  isSnapToGridEnabled,
  viewport,
  objects,
  draftGeometryById,
  draftConnectorById,
  selectedObjectIds,
  gridContentDraftById,
  setGridContentDraftById,
  setAiFooterHeight,
  setIsSnapToGridEnabled,
  refs,
}: RealtimeBoardCanvasRuntimeSyncProps): RealtimeBoardCanvasRuntimeSyncResult {
  const {
    viewportRef,
    canEditRef,
    snapToGridEnabledRef,
    objectsByIdRef,
    lastPositionWriteByIdRef,
    lastGeometryWriteByIdRef,
    lastStickyWriteByIdRef,
    draftGeometryByIdRef,
    draftConnectorByIdRef,
    gridContentDraftByIdRef,
    gridContentSyncTimerByIdRef,
    selectedObjectIdsRef,
    stickyTextHoldDragRef,
  } = refs;

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport, viewportRef]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit, canEditRef]);

  useEffect(() => {
    snapToGridEnabledRef.current = isSnapToGridEnabled;
  }, [isSnapToGridEnabled, snapToGridEnabledRef]);

  const clearStickyTextHoldDrag = useCallback(() => {
    const holdState = stickyTextHoldDragRef.current;
    if (!holdState) {
      return;
    }

    if (holdState.timerId !== null) {
      window.clearTimeout(holdState.timerId);
    }

    stickyTextHoldDragRef.current = null;
  }, [stickyTextHoldDragRef]);

  useEffect(() => {
    return () => {
      clearStickyTextHoldDrag();
    };
  }, [clearStickyTextHoldDrag]);

  useEffect(() => {
    objectsByIdRef.current = new Map(objects.map((item) => [item.id, item]));

    const objectIds = new Set(objects.map((item) => item.id));
    [
      lastPositionWriteByIdRef.current,
      lastGeometryWriteByIdRef.current,
      lastStickyWriteByIdRef.current,
    ].forEach((cache) => {
      Array.from(cache.keys()).forEach((objectId) => {
        if (!objectIds.has(objectId)) {
          cache.delete(objectId);
        }
      });
    });

    const removedGridDraftIds = Object.keys(gridContentDraftByIdRef.current).filter(
      (objectId) => !objectIds.has(objectId),
    );

    if (removedGridDraftIds.length > 0) {
      setGridContentDraftById((previous) => {
        const next = { ...previous };
        removedGridDraftIds.forEach((objectId) => {
          delete next[objectId];
        });
        return next;
      });

      removedGridDraftIds.forEach((objectId) => {
        const timerId = gridContentSyncTimerByIdRef.current.get(objectId);
        if (timerId !== undefined) {
          window.clearTimeout(timerId);
          gridContentSyncTimerByIdRef.current.delete(objectId);
        }
      });
    }
  }, [
    objects,
    objectsByIdRef,
    lastGeometryWriteByIdRef,
    lastPositionWriteByIdRef,
    lastStickyWriteByIdRef,
    gridContentDraftByIdRef,
    setGridContentDraftById,
    gridContentSyncTimerByIdRef,
  ]);

  useEffect(() => {
    draftGeometryByIdRef.current = draftGeometryById;
  }, [draftGeometryById, draftGeometryByIdRef]);

  useEffect(() => {
    draftConnectorByIdRef.current = draftConnectorById;
  }, [draftConnectorById, draftConnectorByIdRef]);

  useEffect(() => {
    gridContentDraftByIdRef.current = gridContentDraftById;
  }, [gridContentDraftById, gridContentDraftByIdRef]);

  useEffect(() => {
    selectedObjectIdsRef.current = new Set(selectedObjectIds);
  }, [selectedObjectIds, selectedObjectIdsRef]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedHeight = window.localStorage.getItem(AI_FOOTER_HEIGHT_STORAGE_KEY);
    if (!savedHeight) {
      return;
    }

    const parsedHeight = Number(savedHeight);
    if (!Number.isFinite(parsedHeight)) {
      return;
    }

    setAiFooterHeight(clampAiFooterHeight(parsedHeight));
  }, [setAiFooterHeight]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const savedSnapToGrid = window.localStorage.getItem(
      SNAP_TO_GRID_STORAGE_KEY,
    );
    if (savedSnapToGrid === null) {
      return;
    }

    setIsSnapToGridEnabled(savedSnapToGrid !== "0");
  }, [setIsSnapToGridEnabled]);

  return { clearStickyTextHoldDrag };
}
