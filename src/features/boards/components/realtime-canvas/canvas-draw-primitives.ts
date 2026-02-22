import type { BoardObject } from "@/features/boards/types";
import {
  getDefaultObjectColor,
  getReadableTextColor,
  getRenderedObjectColor,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { toCanvasPoint } from "@/features/boards/components/realtime-canvas/canvas-hit-test";

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type DrawContext = {
  ctx: CanvasRenderingContext2D;
  viewport: Viewport;
  theme: "light" | "dark";
};

export function drawCanvasGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const majorStep = 100;
  const minorStep = 20;

  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.33)";
  ctx.lineWidth = 1;
  ctx.beginPath();

  for (let x = 0; x <= width; x += minorStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }

  for (let y = 0; y <= height; y += minorStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }

  ctx.stroke();

  ctx.strokeStyle = "rgba(99, 102, 241, 0.42)";
  ctx.setLineDash([2, 4]);

  for (let x = 0; x <= width; x += majorStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 0; y <= height; y += majorStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.restore();
}

function drawTextShape(
  ctx: CanvasRenderingContext2D,
  objectItem: BoardObject,
  x: number,
  y: number,
  theme: "light" | "dark",
  textColor?: string,
): void {
  if (!objectItem.text) {
    return;
  }

  const label = objectItem.text.length > 120 ? `${objectItem.text.slice(0, 117)}...` : objectItem.text;
  ctx.fillStyle = textColor ?? (theme === "dark" ? "#e2e8f0" : "#0f172a");
  ctx.font = "12px ui-sans-serif, system-ui, -apple-system";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + 8, y + 12);
}

function drawSticky(
  ctx: CanvasRenderingContext2D,
  objectItem: BoardObject,
  x: number,
  y: number,
  theme: "light" | "dark",
): void {
  const width = objectItem.width;
  const height = objectItem.height;

  const sourceColor = objectItem.color ?? getDefaultObjectColor(objectItem.type);
  const fill = getRenderedObjectColor(sourceColor, objectItem.type, theme);
  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(15,23,42,0.36)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();

  if (objectItem.text) {
    drawTextShape(ctx, objectItem, x, y, theme, getReadableTextColor(fill));
  }
}

function drawBasicShape(
  ctx: CanvasRenderingContext2D,
  objectItem: BoardObject,
  x: number,
  y: number,
  theme: "light" | "dark",
): void {
  const width = objectItem.width;
  const height = objectItem.height;
  const sourceColor = objectItem.color ?? getDefaultObjectColor(objectItem.type);
  const fill = getRenderedObjectColor(sourceColor, objectItem.type, theme);

  ctx.fillStyle = fill;
  ctx.strokeStyle = "rgba(15,23,42,0.45)";
  ctx.lineWidth = 1;

  switch (objectItem.type) {
    case "rect":
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      break;
    case "circle":
      ctx.beginPath();
      ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      break;
    case "triangle":
      ctx.beginPath();
      ctx.moveTo(x + width / 2, y);
      ctx.lineTo(x + width, y + height);
      ctx.lineTo(x, y + height);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    case "star": {
      const cx = x + width / 2;
      const cy = y + height / 2;
      const outerRadius = Math.min(width, height) / 2;
      const innerRadius = outerRadius * 0.46;
      ctx.beginPath();
      for (let i = 0; i < 10; i += 1) {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5;
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      break;
    }
    case "line":
      ctx.beginPath();
      ctx.moveTo(x, y + height / 2);
      ctx.lineTo(x + width, y + height / 2);
      ctx.strokeStyle = fill;
      ctx.lineWidth = 3;
      ctx.stroke();
      break;
    case "text":
      drawTextShape(ctx, objectItem, x, y, theme);
      break;
    default:
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);
      break;
  }

  if (
    objectItem.text &&
    objectItem.type !== "text" &&
    objectItem.type !== "line"
  ) {
    drawTextShape(ctx, objectItem, x, y, theme, getReadableTextColor(fill));
  }
}

export function drawBoardObject({ ctx, viewport, theme }: DrawContext, objectItem: BoardObject): void {
  const point = toCanvasPoint(objectItem.x, objectItem.y, viewport);
  const shapeTypes: BoardObject["type"][] = [
    "rect",
    "circle",
    "triangle",
    "star",
    "line",
    "sticky",
    "text",
  ];

  if (!shapeTypes.includes(objectItem.type)) {
    return;
  }

  if (objectItem.type === "sticky") {
    drawSticky(ctx, objectItem, point.x, point.y, theme);
    return;
  }

  drawBasicShape(ctx, objectItem, point.x, point.y, theme);
}

export function drawSelectionRing(
  { ctx, viewport }: DrawContext,
  objectItem: BoardObject,
): void {
  const point = toCanvasPoint(objectItem.x, objectItem.y, viewport);
  ctx.save();
  ctx.strokeStyle = "rgba(59,130,246,0.8)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(point.x - 1, point.y - 1, objectItem.width + 2, objectItem.height + 2);
  ctx.restore();
}

export type { DrawContext };
