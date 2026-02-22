export {
  GRID_CELL_SIZE,
  MIN_SCALE,
  MAX_SCALE,
  ZOOM_SLIDER_MIN_PERCENT,
  ZOOM_SLIDER_MAX_PERCENT,
  ZOOM_BUTTON_STEP_PERCENT,
  ZOOM_WHEEL_INTENSITY,
  ZOOM_WHEEL_MAX_EFFECTIVE_DELTA,
  POSITION_WRITE_STEP,
  GEOMETRY_WRITE_EPSILON,
  GEOMETRY_ROTATION_EPSILON_DEG,
  CONNECTOR_MIN_SEGMENT_SIZE,
  CONNECTOR_ANCHORS,
  type BoardPoint,
  type ObjectBounds,
  type ObjectGeometry,
  type ResolvedConnectorEndpoint,
  type ConnectorRoutingObstacle,
  type ConnectorRouteGeometry,
  type ResizeCorner,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/shared";
export {
  toDegrees,
  roundToStep,
  clampScale,
  getAcceleratedWheelZoomDelta,
  toNormalizedRect,
  getSpawnOffset,
  snapToGrid,
  isSnapEligibleObjectType,
  toWritePoint,
  getDistance,
  arePointsClose,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/base";
export {
  areGeometriesClose,
  hasMeaningfulRotation,
  getObjectVisualBounds,
  mergeBounds,
  getLineEndpoints,
  getLineEndpointOffsets,
  toConnectorGeometryFromEndpoints,
  inflateObjectBounds,
  doBoundsOverlap,
  getConnectorHitBounds,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/object-geometry";
export {
  getAnchorDirectionForGeometry,
  getAnchorPointForGeometry,
  scoreEndpointDirectionAlignment,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/connector-anchors";
export {
  scoreConnectorRoute,
  buildConnectorRouteGeometry,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/routing";
export {
  CORNER_HANDLES,
  getCornerCursor,
  getCornerPositionStyle,
  cloneBoardObjectForClipboard,
  isEditableKeyboardTarget,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry/ui-utils";
