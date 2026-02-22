"use client";

import { type RefObject, useEffect, useState } from "react";

import type { BoardObjectKind } from "@/features/boards/types";

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type BoardObjectParserOptions = {
  gridContainerMaxRows: number;
  gridContainerMaxCols: number;
  gridContainerDefaultGap: number;
};

export const BOARD_SCENE_RENDER_TYPES = new Set<BoardObjectKind>([
  "sticky",
  "text",
  "rect",
  "circle",
  "triangle",
  "star",
  "line",
  "gridContainer",
  "connectorUndirected",
  "connectorArrow",
  "connectorBidirectional",
]);

export const BOARD_SCENE_CANVAS_PARSER_OPTIONS: BoardObjectParserOptions = {
  gridContainerMaxRows: 6,
  gridContainerMaxCols: 6,
  gridContainerDefaultGap: 2,
};

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 4;
export const ZOOM_STEP = 0.1;
export const CANVAS_ACTION_BUTTON_STYLE: Record<string, string> = {
  width: "36px",
  height: "36px",
  borderRadius: "9px",
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "12px",
  cursor: "pointer",
};

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function roundCanvasPoint(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toCanvasPointString(point: { x: number; y: number }): string {
  return `${roundCanvasPoint(point.x)},${roundCanvasPoint(point.y)}`;
}

export function useObservedSize(
  ref: RefObject<HTMLElement | null>,
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 1, height: 1 });

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(1, Math.floor(rect.width)),
        height: Math.max(1, Math.floor(rect.height)),
      });
    });

    observer.observe(node);
    const initial = node.getBoundingClientRect();
    setSize({
      width: Math.max(1, Math.floor(initial.width)),
      height: Math.max(1, Math.floor(initial.height)),
    });

    return () => observer.disconnect();
  }, [ref]);

  return size;
}
