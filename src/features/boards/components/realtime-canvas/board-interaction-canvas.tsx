"use client";

import type { CSSProperties } from "react";
import type { MouseEvent } from "react";
import type { ReactNode } from "react";

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type BoardInteractionCanvasProps = {
  height: number;
  width: number;
  onPan: (deltaX: number, deltaY: number) => void;
  onZoom: (scale: number, centerX: number, centerY: number) => void;
  onCanvasClick: () => void;
  children?: ReactNode;
  viewport: Viewport;
};

export default function BoardInteractionCanvas({
  height,
  width,
  onPan,
  onZoom,
  onCanvasClick,
  children,
  viewport,
}: BoardInteractionCanvasProps) {
  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>): void => {
    event.preventDefault();
    onCanvasClick();
  };

  const shellStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "auto",
    cursor: viewport.scale > 0 ? "grab" : "default",
    width,
    height,
    touchAction: "none",
  };

  return (
    <div
      style={shellStyle}
      onPointerMove={(event) => {
        if (!event.buttons) {
          return;
        }

        onPan(event.movementX, event.movementY);
      }}
      onWheel={(event) => {
        event.preventDefault();
        const delta = -Math.sign(event.deltaY);
        onZoom(0.05 * delta, event.clientX, event.clientY);
      }}
      onDoubleClick={handleDoubleClick}
    >
      {children}
    </div>
  );
}
