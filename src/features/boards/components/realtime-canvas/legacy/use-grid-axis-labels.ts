"use client";

import { useMemo } from "react";

import { GRID_MAJOR_SPACING } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ViewportState } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";

type AxisLabel = { screen: number; value: number };

export function useGridAxisLabels(
  stageSize: { width: number; height: number },
  viewport: ViewportState,
): {
  xLabels: AxisLabel[];
  yLabels: AxisLabel[];
} {
  return useMemo(() => {
    if (
      stageSize.width <= 0 ||
      stageSize.height <= 0 ||
      viewport.scale <= 0 ||
      !Number.isFinite(viewport.scale)
    ) {
      return {
        xLabels: [] as AxisLabel[],
        yLabels: [] as AxisLabel[],
      };
    }

    const worldLeft = (-viewport.x) / viewport.scale;
    const worldRight = (stageSize.width - viewport.x) / viewport.scale;
    const worldTop = (-viewport.y) / viewport.scale;
    const worldBottom = (stageSize.height - viewport.y) / viewport.scale;
    const spacingOnScreen = GRID_MAJOR_SPACING * viewport.scale;
    const labelStride = Math.max(
      1,
      Math.ceil(56 / Math.max(18, spacingOnScreen)),
    );

    const xLabels: AxisLabel[] = [];
    const yLabels: AxisLabel[] = [];
    const startX =
      Math.floor(worldLeft / GRID_MAJOR_SPACING) * GRID_MAJOR_SPACING;
    const startY =
      Math.floor(worldTop / GRID_MAJOR_SPACING) * GRID_MAJOR_SPACING;

    for (
      let index = 0, worldX = startX;
      worldX <= worldRight && index < 800;
      index += 1, worldX += GRID_MAJOR_SPACING
    ) {
      const majorIndex = Math.round(worldX / GRID_MAJOR_SPACING);
      if (majorIndex % labelStride !== 0) {
        continue;
      }

      xLabels.push({
        screen: viewport.x + worldX * viewport.scale,
        value: Math.round(worldX),
      });
    }

    for (
      let index = 0, worldY = startY;
      worldY <= worldBottom && index < 800;
      index += 1, worldY += GRID_MAJOR_SPACING
    ) {
      const majorIndex = Math.round(worldY / GRID_MAJOR_SPACING);
      if (majorIndex % labelStride !== 0) {
        continue;
      }

      yLabels.push({
        screen: viewport.y + worldY * viewport.scale,
        value: Math.round(worldY),
      });
    }

    return { xLabels, yLabels };
  }, [stageSize.height, stageSize.width, viewport.scale, viewport.x, viewport.y]);
}
