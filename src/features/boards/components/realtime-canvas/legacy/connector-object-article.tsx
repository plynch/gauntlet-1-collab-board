import type { PointerEvent as ReactPointerEvent } from "react";

import type { BoardObject } from "@/features/boards/types";
import { toRoundedConnectorPath } from "@/features/boards/components/realtime-canvas/connector-routing-geometry";
import {
  CONNECTOR_DISCONNECTED_HANDLE_SIZE,
  CONNECTOR_HANDLE_SIZE,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { BoardPoint } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import type { ConnectorRouteResult } from "@/features/boards/components/realtime-canvas/legacy/connector-route-runtime";

type ConnectorFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type ConnectorObjectArticleProps = {
  objectItem: BoardObject;
  connectorRoute: ConnectorRouteResult;
  connectorFrame: ConnectorFrame;
  renderedObjectColor: string;
  objectLabelText: string;
  isSelected: boolean;
  isSingleSelected: boolean;
  canEdit: boolean;
  isEndpointDragActive: boolean;
  shouldPreserveGroupSelection: (objectId: string) => boolean;
  selectSingleObject: (objectId: string) => void;
  toggleObjectSelection: (objectId: string) => void;
  startConnectorEndpointDrag: (
    objectId: string,
    endpoint: "from" | "to",
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
};

function buildArrowHeadPoints(tip: BoardPoint, direction: BoardPoint): string {
  const directionMagnitude = Math.hypot(direction.x, direction.y);
  const normalizedDirection =
    directionMagnitude > 0.0001
      ? {
          x: direction.x / directionMagnitude,
          y: direction.y / directionMagnitude,
        }
      : { x: 1, y: 0 };
  const perpendicular = {
    x: -normalizedDirection.y,
    y: normalizedDirection.x,
  };
  const arrowLength = 12;
  const arrowWidth = 6;
  const backPoint = {
    x: tip.x - normalizedDirection.x * arrowLength,
    y: tip.y - normalizedDirection.y * arrowLength,
  };
  const leftPoint = {
    x: backPoint.x + perpendicular.x * arrowWidth,
    y: backPoint.y + perpendicular.y * arrowWidth,
  };
  const rightPoint = {
    x: backPoint.x - perpendicular.x * arrowWidth,
    y: backPoint.y - perpendicular.y * arrowWidth,
  };
  return `${tip.x},${tip.y} ${leftPoint.x},${leftPoint.y} ${rightPoint.x},${rightPoint.y}`;
}

export function ConnectorObjectArticle({
  objectItem,
  connectorRoute,
  connectorFrame,
  renderedObjectColor,
  objectLabelText,
  isSelected,
  isSingleSelected,
  canEdit,
  isEndpointDragActive,
  shouldPreserveGroupSelection,
  selectSingleObject,
  toggleObjectSelection,
  startConnectorEndpointDrag,
}: ConnectorObjectArticleProps) {
  const strokeWidth = 3;
  const resolvedConnector = connectorRoute.resolved;
  const relativeRoutePoints = connectorRoute.geometry.points.map((point) => ({
    x: point.x - connectorFrame.left,
    y: point.y - connectorFrame.top,
  }));
  const connectorPath = toRoundedConnectorPath(relativeRoutePoints, 16);
  const fromOffset = relativeRoutePoints[0] ?? {
    x: resolvedConnector.from.x - connectorFrame.left,
    y: resolvedConnector.from.y - connectorFrame.top,
  };
  const toOffset = relativeRoutePoints[relativeRoutePoints.length - 1] ?? {
    x: resolvedConnector.to.x - connectorFrame.left,
    y: resolvedConnector.to.y - connectorFrame.top,
  };
  const startDirection = connectorRoute.geometry.startDirection;
  const endDirection = connectorRoute.geometry.endDirection;
  const showFromArrow = objectItem.type === "connectorBidirectional";
  const showToArrow =
    objectItem.type === "connectorArrow" ||
    objectItem.type === "connectorBidirectional";
  const selectConnector = (event: ReactPointerEvent<Element>) => {
    event.stopPropagation();
    if (event.shiftKey) {
      toggleObjectSelection(objectItem.id);
      return;
    }
    if (shouldPreserveGroupSelection(objectItem.id)) {
      return;
    }
    selectSingleObject(objectItem.id);
  };

  return (
    <article
      data-board-object="true"
      onPointerDown={selectConnector}
      style={{
        position: "absolute",
        left: connectorFrame.left,
        top: connectorFrame.top,
        width: connectorFrame.width,
        height: connectorFrame.height,
        overflow: "visible",
        boxShadow: "none",
        transition: isEndpointDragActive
          ? "none"
          : "left 95ms cubic-bezier(0.22, 1, 0.36, 1), top 95ms cubic-bezier(0.22, 1, 0.36, 1), width 95ms cubic-bezier(0.22, 1, 0.36, 1), height 95ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      <svg
        onPointerDown={selectConnector}
        viewBox={`0 0 ${connectorFrame.width} ${connectorFrame.height}`}
        width={connectorFrame.width}
        height={connectorFrame.height}
        style={{
          display: "block",
          overflow: "visible",
          cursor: canEdit ? "pointer" : "default",
          filter: isSelected ? "drop-shadow(0 0 5px rgba(37, 99, 235, 0.45))" : "none",
        }}
      >
        <path
          d={connectorPath}
          stroke={renderedObjectColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          style={{
            transition: isEndpointDragActive
              ? "none"
              : "d 95ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
        {showFromArrow ? (
          <polygon
            points={buildArrowHeadPoints(fromOffset, {
              x: -startDirection.x,
              y: -startDirection.y,
            })}
            fill={renderedObjectColor}
          />
        ) : null}
        {showToArrow ? (
          <polygon
            points={buildArrowHeadPoints(toOffset, endDirection)}
            fill={renderedObjectColor}
          />
        ) : null}
      </svg>

      {objectLabelText.length > 0 ? (
        <div
          style={{
            position: "absolute",
            left: connectorRoute.geometry.midPoint.x - connectorFrame.left,
            top: connectorRoute.geometry.midPoint.y - connectorFrame.top,
            transform: "translate(-50%, -50%)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.25,
            padding: "0.2rem 0.45rem",
            boxShadow: "0 2px 8px rgba(2,6,23,0.2)",
            maxWidth: 180,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
          title={objectLabelText}
        >
          {objectLabelText}
        </div>
      ) : null}

      {isSingleSelected && canEdit ? (
        <>
          <button
            type="button"
            onPointerDown={(event) => startConnectorEndpointDrag(objectItem.id, "from", event)}
            aria-label="Adjust connector start"
            style={{
              position: "absolute",
              left: fromOffset.x - (resolvedConnector.from.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE) / 2,
              top: fromOffset.y - (resolvedConnector.from.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE) / 2,
              width: resolvedConnector.from.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
              height: resolvedConnector.from.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
              borderRadius: "50%",
              border: resolvedConnector.from.connected ? "1.5px solid #1d4ed8" : "2px solid #b45309",
              background: resolvedConnector.from.connected ? "#dbeafe" : "#fff7ed",
              boxShadow: resolvedConnector.from.connected
                ? "0 0 0 2px rgba(59, 130, 246, 0.2)"
                : "0 0 0 3px rgba(245, 158, 11, 0.28)",
              cursor: "move",
            }}
          />
          <button
            type="button"
            onPointerDown={(event) => startConnectorEndpointDrag(objectItem.id, "to", event)}
            aria-label="Adjust connector end"
            style={{
              position: "absolute",
              left: toOffset.x - (resolvedConnector.to.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE) / 2,
              top: toOffset.y - (resolvedConnector.to.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE) / 2,
              width: resolvedConnector.to.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
              height: resolvedConnector.to.connected ? CONNECTOR_HANDLE_SIZE : CONNECTOR_DISCONNECTED_HANDLE_SIZE,
              borderRadius: "50%",
              border: resolvedConnector.to.connected ? "1.5px solid #1d4ed8" : "2px solid #b45309",
              background: resolvedConnector.to.connected ? "#dbeafe" : "#fff7ed",
              boxShadow: resolvedConnector.to.connected
                ? "0 0 0 2px rgba(59, 130, 246, 0.2)"
                : "0 0 0 3px rgba(245, 158, 11, 0.28)",
              cursor: "move",
            }}
          />
        </>
      ) : (
        <>
          {!resolvedConnector.from.connected ? (
            <span
              style={{
                position: "absolute",
                left: fromOffset.x - 6,
                top: fromOffset.y - 6,
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid #b45309",
                background: "#fff7ed",
                boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.2)",
                pointerEvents: "none",
              }}
            />
          ) : null}
          {!resolvedConnector.to.connected ? (
            <span
              style={{
                position: "absolute",
                left: toOffset.x - 6,
                top: toOffset.y - 6,
                width: 12,
                height: 12,
                borderRadius: "50%",
                border: "2px solid #b45309",
                background: "#fff7ed",
                boxShadow: "0 0 0 2px rgba(245, 158, 11, 0.2)",
                pointerEvents: "none",
              }}
            />
          ) : null}
        </>
      )}
    </article>
  );
}
