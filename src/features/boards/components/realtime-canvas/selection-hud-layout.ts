export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type CanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export type CanvasSize = {
  width: number;
  height: number;
};

type SelectionHudLayoutOptions = {
  canShowHud: boolean;
  selectedObjectBounds: CanvasBounds | null;
  stageSize: CanvasSize;
  viewport: CanvasViewport;
  selectionHudSize: CanvasSize;
  selectedConnectorMidpoint: CanvasPoint | null;
  preferSidePlacement: boolean;
};

/**
 * Handles calculate selection hud position.
 */
export function calculateSelectionHudPosition(
  options: SelectionHudLayoutOptions,
): CanvasPoint | null {
  if (!options.canShowHud || !options.selectedObjectBounds) {
    return null;
  }

  if (options.stageSize.width <= 0 || options.stageSize.height <= 0) {
    return null;
  }

  const hudWidth =
    options.selectionHudSize.width > 0 ? options.selectionHudSize.width : 214;
  const hudHeight =
    options.selectionHudSize.height > 0 ? options.selectionHudSize.height : 86;
  const edgePadding = 10;
  const offset = 10;
  const maxX = Math.max(
    edgePadding,
    options.stageSize.width - hudWidth - edgePadding,
  );
  const maxY = Math.max(
    edgePadding,
    options.stageSize.height - hudHeight - edgePadding,
  );
  /**
   * Handles clamp point.
   */
  const clampPoint = (point: CanvasPoint) => ({
    x: Math.max(edgePadding, Math.min(maxX, point.x)),
    y: Math.max(edgePadding, Math.min(maxY, point.y)),
  });

  if (options.selectedConnectorMidpoint) {
    const connectorCenter = {
      x:
        options.viewport.x +
        options.selectedConnectorMidpoint.x * options.viewport.scale -
        hudWidth / 2,
      y:
        options.viewport.y +
        options.selectedConnectorMidpoint.y * options.viewport.scale -
        hudHeight / 2,
    };

    return clampPoint(connectorCenter);
  }

  const selectionLeft =
    options.viewport.x +
    options.selectedObjectBounds.left * options.viewport.scale;
  const selectionRight =
    options.viewport.x +
    options.selectedObjectBounds.right * options.viewport.scale;
  const selectionTop =
    options.viewport.y +
    options.selectedObjectBounds.top * options.viewport.scale;
  const selectionBottom =
    options.viewport.y +
    options.selectedObjectBounds.bottom * options.viewport.scale;
  const selectionCenterY = (selectionTop + selectionBottom) / 2;

  /**
   * Returns whether fully visible is true.
   */
  const isFullyVisible = (point: CanvasPoint) =>
    point.x >= edgePadding &&
    point.y >= edgePadding &&
    point.x + hudWidth <= options.stageSize.width - edgePadding &&
    point.y + hudHeight <= options.stageSize.height - edgePadding;

  const candidates = options.preferSidePlacement
    ? [
        { x: selectionRight + offset, y: selectionCenterY - hudHeight / 2 },
        {
          x: selectionLeft - hudWidth - offset,
          y: selectionCenterY - hudHeight / 2,
        },
        { x: selectionRight - hudWidth, y: selectionBottom + offset },
        { x: selectionRight - hudWidth, y: selectionTop - hudHeight - offset },
      ]
    : [
        { x: selectionRight - hudWidth, y: selectionTop - hudHeight - offset },
        { x: selectionRight - hudWidth, y: selectionBottom + offset },
        { x: selectionRight + offset, y: selectionCenterY - hudHeight / 2 },
        {
          x: selectionLeft - hudWidth - offset,
          y: selectionCenterY - hudHeight / 2,
        },
      ];

  const visibleCandidate = candidates.find((candidate) =>
    isFullyVisible(candidate),
  );
  if (visibleCandidate) {
    return visibleCandidate;
  }

  return clampPoint(candidates[0] ?? { x: edgePadding, y: edgePadding });
}
