import type { BoardObject } from "@/features/boards/types";
import { getDefaultObjectColor, getObjectLabel } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { toCanvasPoint } from "@/features/boards/components/realtime-canvas/canvas-hit-test";
import type { Viewport } from "@/features/boards/components/realtime-canvas/board-scene-utils";

type RoutePoint = {
  x: number;
  y: number;
};

type CanvasRoute = {
  points: RoutePoint[];
};

function roundToPixel(value: number): number {
  return Math.round(value * 100) / 100;
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  strokeColor: string,
  scale: number,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const arrowLength = Math.min(14, Math.max(6, 12 * scale));

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    roundToPixel(to.x - arrowLength * Math.cos(angle - Math.PI / 6)),
    roundToPixel(to.y - arrowLength * Math.sin(angle - Math.PI / 6)),
  );
  ctx.lineTo(
    roundToPixel(to.x - arrowLength * Math.cos(angle + Math.PI / 6)),
    roundToPixel(to.y - arrowLength * Math.sin(angle + Math.PI / 6)),
  );
  ctx.closePath();
  ctx.fillStyle = strokeColor;
  ctx.fill();
}

export function drawConnectorRoute(
  ctx: CanvasRenderingContext2D,
  route: CanvasRoute,
  from: BoardObject,
  to: BoardObject,
  viewport: Viewport,
): void {
  if (route.points.length < 2) {
    return;
  }

  const screenPoints = route.points.map((point) => toCanvasPoint(point.x, point.y, viewport));
  const strokeColor = getDefaultObjectColor("connectorArrow");

  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = Math.max(1, 1.5 * viewport.scale);
  ctx.beginPath();
  const first = screenPoints[0];
  ctx.moveTo(roundToPixel(first.x), roundToPixel(first.y));
  for (let index = 1; index < screenPoints.length; index += 1) {
    const point = screenPoints[index];
    ctx.lineTo(roundToPixel(point.x), roundToPixel(point.y));
  }

  ctx.stroke();

  const last = screenPoints[screenPoints.length - 1];
  const previous = screenPoints[Math.max(0, screenPoints.length - 2)];
  drawArrowHead(ctx, previous, last, strokeColor, viewport.scale);

  if (from.text) {
    const label = getObjectLabel(from.type);
    const labelPosition = screenPoints[0];
    ctx.fillStyle = "rgba(15,23,42,0.7)";
    ctx.font = "11px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(
      `${label}: ${from.text}`,
      roundToPixel(labelPosition.x + 8),
      roundToPixel(labelPosition.y + 10),
    );
  }
  if (to.text) {
    const label = getObjectLabel(to.type);
    const labelPosition = last;
    ctx.fillStyle = "rgba(15,23,42,0.7)";
    ctx.font = "11px ui-sans-serif, system-ui, -apple-system";
    ctx.fillText(
      `to ${label}: ${to.text}`,
      roundToPixel(labelPosition.x + 8),
      roundToPixel(labelPosition.y + 10),
    );
  }

  ctx.restore();
}
