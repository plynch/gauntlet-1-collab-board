import type { BoardObject } from "@/features/boards/types";
import { toCanvasPoint } from "@/features/boards/components/realtime-canvas/canvas-hit-test";

export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export function drawGridContainerSections(
  ctx: CanvasRenderingContext2D,
  containerObject: BoardObject,
  viewport: Viewport,
): void {
  if (containerObject.type !== "gridContainer") {
    return;
  }

  const topLeft = toCanvasPoint(containerObject.x, containerObject.y, viewport);
  const width = containerObject.width;
  const height = containerObject.height;

  ctx.save();
  ctx.fillStyle = "rgba(203, 213, 225, 0.08)";
  ctx.strokeStyle = "rgba(148, 163, 184, 0.48)";
  ctx.lineWidth = 1.5;
  ctx.fillRect(topLeft.x, topLeft.y, width, height);
  ctx.strokeRect(topLeft.x, topLeft.y, width, height);

  if (containerObject.containerTitle) {
    ctx.fillStyle = "var(--text-muted)";
    ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(containerObject.containerTitle, topLeft.x + 8, topLeft.y + 16);
  }

  ctx.restore();
}
