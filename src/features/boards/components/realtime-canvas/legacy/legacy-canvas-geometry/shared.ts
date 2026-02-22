import type {
  BoardObject,
  BoardObjectKind,
  ConnectorAnchor,
} from "@/features/boards/types";

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 2;
export const ZOOM_SLIDER_MIN_PERCENT = Math.round(MIN_SCALE * 100);
export const ZOOM_SLIDER_MAX_PERCENT = Math.round(MAX_SCALE * 100);
export const ZOOM_BUTTON_STEP_PERCENT = 5;
export const ZOOM_WHEEL_INTENSITY = 0.0065;
export const ZOOM_WHEEL_MAX_EFFECTIVE_DELTA = 180;
export const POSITION_WRITE_STEP = 0.5;
export const GEOMETRY_WRITE_EPSILON = 0.3;
export const GEOMETRY_ROTATION_EPSILON_DEG = 0.35;
export const GRID_CELL_SIZE = 20;
export const CONNECTOR_MIN_SEGMENT_SIZE = 12;

export const CONNECTOR_ANCHORS: readonly ConnectorAnchor[] = [
  "top",
  "right",
  "bottom",
  "left",
];

export type BoardPoint = {
  x: number;
  y: number;
};

export type ObjectBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

export type ResolvedConnectorEndpoint = {
  x: number;
  y: number;
  objectId: string | null;
  anchor: ConnectorAnchor | null;
  direction: BoardPoint | null;
  connected: boolean;
};

export type ConnectorRoutingObstacle = {
  objectId: string;
  bounds: ObjectBounds;
};

export type ConnectorRouteGeometry = {
  points: BoardPoint[];
  bounds: ObjectBounds;
  midPoint: BoardPoint;
  startDirection: BoardPoint;
  endDirection: BoardPoint;
};

export type ResizeCorner = "nw" | "ne" | "sw" | "se";

export type {
  BoardObject,
  BoardObjectKind,
  ConnectorAnchor,
};
