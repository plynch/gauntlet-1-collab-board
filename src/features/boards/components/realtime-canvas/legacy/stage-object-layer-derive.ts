import type { BoardObject } from "@/features/boards/types";
import {
  getReadableTextColor,
  getRenderedObjectColor,
  isConnectorKind,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { getLineEndpointOffsets } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  GRID_CONTAINER_DEFAULT_GAP,
  SWOT_SECTION_COLORS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { ConnectorRouteResult } from "@/features/boards/components/realtime-canvas/legacy/connector-route-runtime";
import type {
  GridContainerContentDraft,
  ObjectGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import {
  getDefaultSectionTitles,
  normalizeSectionValues,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";

type DeriveStageObjectRenderDataArgs = {
  objectItem: BoardObject;
  draftGeometryById: Record<string, ObjectGeometry>;
  textDrafts: Record<string, string>;
  selectedObjectIds: string[];
  connectorRoutesById: Map<string, ConnectorRouteResult>;
  resolvedTheme: "light" | "dark";
  getGridDraftForObject: (objectItem: BoardObject) => GridContainerContentDraft;
};

export type StageObjectRenderData = {
  hasDraftGeometry: boolean;
  objectX: number;
  objectY: number;
  objectWidth: number;
  objectHeight: number;
  objectRotationDeg: number;
  objectText: string;
  objectLabelText: string;
  isSelected: boolean;
  isSingleSelected: boolean;
  isConnector: boolean;
  renderedObjectColor: string;
  objectSurfaceColor: string;
  objectTextColor: string;
  connectorRoute: ConnectorRouteResult | null;
  connectorFrame: { left: number; top: number; width: number; height: number } | null;
  lineEndpointOffsets: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
  isPolygonShape: boolean;
  isGridContainer: boolean;
  gridRows: number;
  gridCols: number;
  gridGap: number;
  gridTotalCells: number;
  gridCellColors: string[];
  gridContainerTitle: string;
  gridSectionTitles: string[];
};

export function deriveStageObjectRenderData({
  objectItem,
  draftGeometryById,
  textDrafts,
  selectedObjectIds,
  connectorRoutesById,
  resolvedTheme,
  getGridDraftForObject,
}: DeriveStageObjectRenderDataArgs): StageObjectRenderData {
  const draftGeometry = draftGeometryById[objectItem.id];
  const hasDraftGeometry = Boolean(draftGeometry);
  const objectX = draftGeometry?.x ?? objectItem.x;
  const objectY = draftGeometry?.y ?? objectItem.y;
  const objectWidth = draftGeometry?.width ?? objectItem.width;
  const objectHeight = draftGeometry?.height ?? objectItem.height;
  const objectRotationDeg = draftGeometry?.rotationDeg ?? objectItem.rotationDeg;
  const objectText = textDrafts[objectItem.id] ?? objectItem.text;
  const objectLabelText =
    objectItem.type === "sticky" ||
    objectItem.type === "gridContainer" ||
    objectItem.type === "text"
      ? ""
      : (objectItem.text ?? "").trim();
  const isSelected = selectedObjectIds.includes(objectItem.id);
  const isSingleSelected = selectedObjectIds.length === 1 && isSelected;
  const isConnector = isConnectorKind(objectItem.type);
  const renderedObjectColor = getRenderedObjectColor(
    objectItem.color,
    objectItem.type,
    resolvedTheme,
  );
  const objectSurfaceColor =
    resolvedTheme === "dark"
      ? "rgba(241, 245, 249, 0.58)"
      : "rgba(15, 23, 42, 0.55)";
  const objectTextColor = getReadableTextColor(renderedObjectColor);
  const objectGeometry: ObjectGeometry = {
    x: objectX,
    y: objectY,
    width: objectWidth,
    height: objectHeight,
    rotationDeg: objectRotationDeg,
  };
  const connectorRoute = isConnector
    ? (connectorRoutesById.get(objectItem.id) ?? null)
    : null;
  const connectorFrame = connectorRoute
    ? {
        left: connectorRoute.geometry.bounds.left,
        top: connectorRoute.geometry.bounds.top,
        width: Math.max(
          1,
          connectorRoute.geometry.bounds.right - connectorRoute.geometry.bounds.left,
        ),
        height: Math.max(
          1,
          connectorRoute.geometry.bounds.bottom - connectorRoute.geometry.bounds.top,
        ),
      }
    : null;
  const lineEndpointOffsets =
    objectItem.type === "line" ? getLineEndpointOffsets(objectGeometry) : null;
  const isPolygonShape =
    objectItem.type === "triangle" || objectItem.type === "star";
  const isGridContainer = objectItem.type === "gridContainer";
  const gridRows = isGridContainer ? Math.max(1, objectItem.gridRows ?? 2) : 0;
  const gridCols = isGridContainer ? Math.max(1, objectItem.gridCols ?? 2) : 0;
  const gridGap = isGridContainer
    ? Math.max(0, objectItem.gridGap ?? GRID_CONTAINER_DEFAULT_GAP)
    : 0;
  const gridTotalCells = isGridContainer ? gridRows * gridCols : 0;
  const gridCellColors = isGridContainer
    ? Array.from({ length: gridTotalCells }, (_, index) => {
        const explicitColor = objectItem.gridCellColors?.[index];
        if (typeof explicitColor === "string" && explicitColor.trim().length > 0) {
          return explicitColor;
        }

        if (gridRows === 2 && gridCols === 2) {
          return SWOT_SECTION_COLORS[index] ?? "transparent";
        }

        return "transparent";
      })
    : [];
  const gridFallbackTitles = isGridContainer
    ? getDefaultSectionTitles(gridRows, gridCols)
    : [];
  const gridDraft = isGridContainer ? getGridDraftForObject(objectItem) : null;
  const gridContainerTitle =
    gridDraft?.containerTitle ?? objectItem.containerTitle ?? "";
  const gridSectionTitles =
    gridDraft?.sectionTitles ??
    normalizeSectionValues(
      objectItem.gridSectionTitles,
      gridTotalCells,
      (index) => gridFallbackTitles[index] ?? `Section ${index + 1}`,
      80,
    );

  return {
    hasDraftGeometry,
    objectX,
    objectY,
    objectWidth,
    objectHeight,
    objectRotationDeg,
    objectText,
    objectLabelText,
    isSelected,
    isSingleSelected,
    isConnector,
    renderedObjectColor,
    objectSurfaceColor,
    objectTextColor,
    connectorRoute,
    connectorFrame,
    lineEndpointOffsets,
    isPolygonShape,
    isGridContainer,
    gridRows,
    gridCols,
    gridGap,
    gridTotalCells,
    gridCellColors,
    gridContainerTitle,
    gridSectionTitles,
  };
}
