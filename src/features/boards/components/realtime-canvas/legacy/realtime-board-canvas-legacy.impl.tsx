"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

import type {
  BoardObject,
  BoardObjectKind,
  ConnectorAnchor,
  PresenceUser,
} from "@/features/boards/types";
import {
  AI_WELCOME_MESSAGE,
} from "@/features/boards/components/realtime-canvas/ai-chat-content";
import {
  canUseSelectionHudColor,
  getDefaultObjectColor,
  getDefaultObjectSize,
  getMinimumObjectSize,
  isBackgroundContainerType,
  isConnectableShapeKind,
  isConnectorKind,
  LINE_MIN_LENGTH,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { hashToColor } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import {
  AI_FOOTER_DEFAULT_HEIGHT,
  clampAiFooterHeight,
} from "@/features/boards/components/realtime-canvas/ai-footer-config";
import { toBoardErrorMessage } from "@/features/boards/components/realtime-canvas/board-error";
import {
  CONNECTOR_ANCHORS,
  CONNECTOR_MIN_SEGMENT_SIZE,
  getAnchorDirectionForGeometry,
  getAnchorPointForGeometry,
  getConnectorHitBounds,
  getDistance,
  getObjectVisualBounds,
  getSpawnOffset,
  hasMeaningfulRotation,
  isSnapEligibleObjectType,
  roundToStep,
  snapToGrid,
  toConnectorGeometryFromEndpoints,
  toDegrees,
  toNormalizedRect,
  toWritePoint,
  ZOOM_SLIDER_MAX_PERCENT,
  ZOOM_SLIDER_MIN_PERCENT,
  type ResolvedConnectorEndpoint,
} from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";
import {
  COLLAPSED_PANEL_WIDTH,
  CONNECTOR_HIT_PADDING,
  CONNECTOR_SNAP_DISTANCE_PX,
  CONTAINER_DRAG_THROTTLE_MS,
  CURSOR_MIN_MOVE_DISTANCE,
  DRAG_CLICK_SLOP_PX,
  DRAG_THROTTLE_MS,
  GRID_CONTAINER_DEFAULT_GAP,
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
  INITIAL_VIEWPORT,
  LEFT_PANEL_WIDTH,
  OBJECT_LABEL_MAX_LENGTH,
  OBJECT_SPAWN_STEP_PX,
  PANEL_COLLAPSE_ANIMATION,
  PANEL_SEPARATOR_COLOR,
  PANEL_SEPARATOR_WIDTH,
  PRESENCE_TTL_MS,
  RESIZE_THROTTLE_MS,
  RIGHT_PANEL_WIDTH,
  ROTATE_THROTTLE_MS,
  SWOT_SECTION_COLORS,
  SWOT_TEMPLATE_TITLE,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type {
  AiFooterResizeState,
  BoardPoint,
  ConnectorDraft,
  ConnectorEndpointDragState,
  CornerResizeState,
  DragState,
  GridContainerContentDraft,
  LineEndpointResizeState,
  MarqueeSelectionState,
  ObjectGeometry,
  PanState,
  RealtimeBoardCanvasProps,
  RotateState,
  StickyTextHoldDragState,
  StickyTextSyncState,
  ViewportState,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { useFpsMeter } from "@/features/boards/components/realtime-canvas/legacy/use-fps-meter";
import { useObjectTemplateActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-template-actions";
import { useBoardSelectionActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-selection-actions";
import { useAiCommandSubmit } from "@/features/boards/components/realtime-canvas/legacy/use-ai-command-submit";
import { AiAssistantFooter } from "@/features/boards/components/realtime-canvas/legacy/ai-assistant-footer";
import { LeftToolsPanel } from "@/features/boards/components/realtime-canvas/legacy/left-tools-panel";
import { RightPresencePanel } from "@/features/boards/components/realtime-canvas/legacy/right-presence-panel";
import { StageSurface } from "@/features/boards/components/realtime-canvas/legacy/stage-surface";
import { useBoardStageInteractions } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-interactions";
import { useBoardStageWindowPointerEvents } from "@/features/boards/components/realtime-canvas/legacy/use-board-stage-window-pointer-events";
import { LeftToolsPanelControls } from "@/features/boards/components/realtime-canvas/legacy/left-tools-panel-controls";
import {
  DEFAULT_SWOT_SECTION_TITLES,
  getDefaultSectionTitles,
} from "@/features/boards/components/realtime-canvas/grid-section-utils";
import { useBoardAssistantActions } from "@/features/boards/components/realtime-canvas/legacy/use-board-assistant-actions";
import {
  useContainerMembership,
} from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  getActivePresenceUsers,
  getPresenceLabel,
  getRemoteCursors,
  usePresenceClock,
} from "@/features/boards/components/realtime-canvas/use-presence-sync";
import {
  useAiChatState,
} from "@/features/boards/components/realtime-canvas/use-ai-chat-state";
import {
  useRealtimeBoardCanvasSubscriptionSync,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-subscription-sync";
import {
  createRealtimeWriteMetrics,
} from "@/features/boards/lib/realtime-write-metrics";
import { useBoardZoomControls } from "@/features/boards/components/realtime-canvas/legacy/use-board-zoom-controls";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { useRealtimeBoardCanvasRuntimeSync } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-runtime-sync";
import { useGridAxisLabels } from "@/features/boards/components/realtime-canvas/legacy/use-grid-axis-labels";
import { useGridDimensionUpdates } from "@/features/boards/components/realtime-canvas/legacy/use-grid-dimension-updates";
import { useSelectionUiState } from "@/features/boards/components/realtime-canvas/legacy/use-selection-ui-state";
import { useGridContentSync } from "@/features/boards/components/realtime-canvas/legacy/use-grid-content-sync";
import { useObjectWriteActions } from "@/features/boards/components/realtime-canvas/legacy/use-object-write-actions";
import { useStickyTextSync } from "@/features/boards/components/realtime-canvas/legacy/use-sticky-text-sync";

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  const { resolvedTheme } = useTheme();
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const selectionHudRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cornerResizeStateRef = useRef<CornerResizeState | null>(null);
  const lineEndpointResizeStateRef = useRef<LineEndpointResizeState | null>(
    null,
  );
  const connectorEndpointDragStateRef =
    useRef<ConnectorEndpointDragState | null>(null);
  const rotateStateRef = useRef<RotateState | null>(null);
  const marqueeSelectionStateRef = useRef<MarqueeSelectionState | null>(null);
  const aiFooterResizeStateRef = useRef<AiFooterResizeState | null>(null);
  const stickyTextHoldDragRef = useRef<StickyTextHoldDragState | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());
  const objectSpawnSequenceRef = useRef(0);
  const copiedObjectsRef = useRef<BoardObject[]>([]);
  const copyPasteSequenceRef = useRef(0);
  const selectedObjectIdsRef = useRef<Set<string>>(new Set());
  const draftGeometryByIdRef = useRef<Record<string, ObjectGeometry>>({});
  const draftConnectorByIdRef = useRef<Record<string, ConnectorDraft>>({});
  const gridContentDraftByIdRef = useRef<
    Record<string, GridContainerContentDraft>
  >({});
  const stickyTextSyncStateRef = useRef<Map<string, StickyTextSyncState>>(
    new Map(),
  );
  const gridContentSyncTimerByIdRef = useRef<Map<string, number>>(new Map());
  const sendCursorAtRef = useRef(0);
  const canEditRef = useRef(canEdit);
  const lastCursorWriteRef = useRef<BoardPoint | null>(null);
  const lastPositionWriteByIdRef = useRef<Map<string, BoardPoint>>(new Map());
  const lastGeometryWriteByIdRef = useRef<Map<string, ObjectGeometry>>(
    new Map(),
  );
  const lastStickyWriteByIdRef = useRef<Map<string, string>>(new Map());
  const writeMetricsRef = useRef(createRealtimeWriteMetrics());
  const boardStatusTimerRef = useRef<number | null>(null);

  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [draftGeometryById, setDraftGeometryById] = useState<
    Record<string, ObjectGeometry>
  >({});
  const [draftConnectorById, setDraftConnectorById] = useState<
    Record<string, ConnectorDraft>
  >({});
  const [gridContentDraftById, setGridContentDraftById] = useState<
    Record<string, GridContainerContentDraft>
  >({});
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [marqueeSelectionState, setMarqueeSelectionState] =
    useState<MarqueeSelectionState | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [boardStatusMessage, setBoardStatusMessage] = useState<string | null>(
    null,
  );
  const presenceClock = usePresenceClock(5_000);
  const [isLeftPanelCollapsed, setIsLeftPanelCollapsed] = useState(false);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);
  const [isSnapToGridEnabled, setIsSnapToGridEnabled] = useState(true);
  const [isAiFooterCollapsed, setIsAiFooterCollapsed] = useState(true);
  const [hasAiDrawerBeenInteracted, setHasAiDrawerBeenInteracted] =
    useState(false);
  const [isAiDrawerNudgeActive, setIsAiDrawerNudgeActive] = useState(false);
  const [isAiFooterResizing, setIsAiFooterResizing] = useState(false);
  const [isObjectDragging, setIsObjectDragging] = useState(false);
  const [aiFooterHeight, setAiFooterHeight] = useState(
    AI_FOOTER_DEFAULT_HEIGHT,
  );
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [isSwotTemplateCreating, setIsSwotTemplateCreating] =
    useState(false);
  const {
    chatMessages,
    chatInput,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
    resetHistoryNavigation,
    handleChatInputChange,
    handleChatInputKeyDown,
  } = useAiChatState({
    welcomeMessage: AI_WELCOME_MESSAGE,
  });
  const [selectionLabelDraft, setSelectionLabelDraft] = useState("");
  const [cursorBoardPosition, setCursorBoardPosition] = useState<BoardPoint | null>(
    null,
  );
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [selectionHudSize, setSelectionHudSize] = useState({
    width: 0,
    height: 0,
  });
  const fps = useFpsMeter();

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/objects`),
    [boardId, db],
  );
  const presenceCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/presence`),
    [boardId, db],
  );
  const selfPresenceRef = useMemo(
    () => doc(db, `boards/${boardId}/presence/${user.uid}`),
    [boardId, db, user.uid],
  );
  const snapToGridEnabledRef = useRef(isSnapToGridEnabled);

  const { clearStickyTextHoldDrag } = useRealtimeBoardCanvasRuntimeSync({
    boardId,
    canEdit,
    isSnapToGridEnabled,
    viewport,
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    gridContentDraftById,
    setGridContentDraftById,
    chatMessagesRef,
    chatMessages,
    hasAiDrawerBeenInteracted,
    isAiFooterCollapsed,
    isAiSubmitting,
    setIsAiDrawerNudgeActive,
    aiFooterHeight,
    setAiFooterHeight,
    setIsSnapToGridEnabled,
    stickyTextSyncStateRef,
    stageRef,
    setStageSize,
    writeMetricsRef,
    refs: {
      viewportRef,
      canEditRef,
      snapToGridEnabledRef,
      objectsByIdRef,
      lastPositionWriteByIdRef,
      lastGeometryWriteByIdRef,
      lastStickyWriteByIdRef,
      draftGeometryByIdRef,
      draftConnectorByIdRef,
      gridContentDraftByIdRef,
      gridContentSyncTimerByIdRef,
      selectedObjectIdsRef,
      stickyTextHoldDragRef,
      boardStatusTimerRef,
    },
  });

  useRealtimeBoardCanvasSubscriptionSync({
    boardId,
    user,
    boardColor,
    objectsCollectionRef,
    presenceCollectionRef,
    selfPresenceRef,
    setSelectedObjectIds,
    setObjects,
    setPresenceUsers,
    setBoardError,
    lastCursorWriteRef,
    idTokenRef,
  });

  const getCurrentObjectGeometry = useCallback(
    (objectId: string): ObjectGeometry | null => {
      const draftGeometry = draftGeometryByIdRef.current[objectId];
      if (draftGeometry) {
        return draftGeometry;
      }

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem) {
        return null;
      }

      return {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };
    },
    [],
  );

  const setDraftGeometry = useCallback(
    (objectId: string, geometry: ObjectGeometry) => {
      setDraftGeometryById((previous) => ({
        ...previous,
        [objectId]: geometry,
      }));
    },
    [],
  );

  const clearDraftGeometry = useCallback((objectId: string) => {
    setDraftGeometryById((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
  }, []);

  const setDraftConnector = useCallback(
    (objectId: string, draft: ConnectorDraft) => {
      setDraftConnectorById((previous) => ({
        ...previous,
        [objectId]: draft,
      }));
    },
    [],
  );

  const clearDraftConnector = useCallback((objectId: string) => {
    setDraftConnectorById((previous) => {
      if (!(objectId in previous)) {
        return previous;
      }

      const next = { ...previous };
      delete next[objectId];
      return next;
    });
  }, []);

  const getConnectorDraftForObject = useCallback(
    (objectItem: BoardObject): ConnectorDraft | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const draft = draftConnectorByIdRef.current[objectItem.id];
      if (draft) {
        return draft;
      }

      const objectGeometry = getCurrentObjectGeometry(objectItem.id);
      const fallbackGeometry: ObjectGeometry = objectGeometry ?? {
        x: objectItem.x,
        y: objectItem.y,
        width: objectItem.width,
        height: objectItem.height,
        rotationDeg: objectItem.rotationDeg,
      };

      const defaultFromX =
        objectItem.fromX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.1;
      const defaultFromY =
        objectItem.fromY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;
      const defaultToX =
        objectItem.toX ??
        fallbackGeometry.x +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.width) * 0.9;
      const defaultToY =
        objectItem.toY ??
        fallbackGeometry.y +
          Math.max(CONNECTOR_MIN_SEGMENT_SIZE, fallbackGeometry.height) * 0.5;

      return {
        fromObjectId: objectItem.fromObjectId ?? null,
        toObjectId: objectItem.toObjectId ?? null,
        fromAnchor: objectItem.fromAnchor ?? null,
        toAnchor: objectItem.toAnchor ?? null,
        fromX: defaultFromX,
        fromY: defaultFromY,
        toX: defaultToX,
        toY: defaultToY,
      };
    },
    [getCurrentObjectGeometry],
  );

  const resolveConnectorEndpoint = useCallback(
    (
      objectId: string | null,
      anchor: ConnectorAnchor | null,
      fallbackPoint: BoardPoint,
    ): ResolvedConnectorEndpoint => {
      if (!objectId || !anchor) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorObject = objectsByIdRef.current.get(objectId);
      if (!anchorObject || !isConnectableShapeKind(anchorObject.type)) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return {
          x: fallbackPoint.x,
          y: fallbackPoint.y,
          objectId: null,
          anchor: null,
          direction: null,
          connected: false,
        };
      }

      const anchorPoint = getAnchorPointForGeometry(
        geometry,
        anchor,
        anchorObject.type,
      );
      return {
        x: anchorPoint.x,
        y: anchorPoint.y,
        objectId,
        anchor,
        direction: getAnchorDirectionForGeometry(anchor, geometry),
        connected: true,
      };
    },
    [getCurrentObjectGeometry],
  );

  const getResolvedConnectorEndpoints = useCallback(
    (
      objectItem: BoardObject,
    ): {
      from: ResolvedConnectorEndpoint;
      to: ResolvedConnectorEndpoint;
      draft: ConnectorDraft;
    } | null => {
      if (!isConnectorKind(objectItem.type)) {
        return null;
      }

      const connectorDraft = getConnectorDraftForObject(objectItem);
      if (!connectorDraft) {
        return null;
      }

      const from = resolveConnectorEndpoint(
        connectorDraft.fromObjectId,
        connectorDraft.fromAnchor,
        {
          x: connectorDraft.fromX,
          y: connectorDraft.fromY,
        },
      );
      const to = resolveConnectorEndpoint(
        connectorDraft.toObjectId,
        connectorDraft.toAnchor,
        {
          x: connectorDraft.toX,
          y: connectorDraft.toY,
        },
      );

      return {
        from,
        to,
        draft: connectorDraft,
      };
    },
    [getConnectorDraftForObject, resolveConnectorEndpoint],
  );

  const {
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
  } = useContainerMembership({
    objectsByIdRef,
    getCurrentObjectGeometry,
    maxRows: GRID_CONTAINER_MAX_ROWS,
    maxCols: GRID_CONTAINER_MAX_COLS,
    defaultGap: GRID_CONTAINER_DEFAULT_GAP,
    getDistance,
    roundToStep,
    isConnectorKind,
  });

  const {
    updateObjectGeometry,
    updateConnectorDraft,
    updateObjectPositionsBatch,
  } = useObjectWriteActions({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    writeMetricsRef,
    lastGeometryWriteByIdRef,
    lastPositionWriteByIdRef,
    setBoardError,
    getContainerSectionsInfoById,
    resolveContainerMembershipForGeometry,
    resolveConnectorEndpoint,
  });

  const getObjectSelectionBounds = useCallback(
    (objectItem: BoardObject) => {
      if (isConnectorKind(objectItem.type)) {
        const resolved = getResolvedConnectorEndpoints(objectItem);
        if (resolved) {
          return getConnectorHitBounds(
            resolved.from,
            resolved.to,
            CONNECTOR_HIT_PADDING,
          );
        }
      }

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return {
          left: objectItem.x,
          right: objectItem.x + objectItem.width,
          top: objectItem.y,
          bottom: objectItem.y + objectItem.height,
        };
      }

      return getObjectVisualBounds(objectItem.type, geometry);
    },
    [getCurrentObjectGeometry, getResolvedConnectorEndpoints],
  );

  const getObjectsIntersectingRect = useCallback(
    (rect: {
      left: number;
      right: number;
      top: number;
      bottom: number;
    }): string[] => {
      const intersectingObjectIds: string[] = [];

      objectsByIdRef.current.forEach((objectItem) => {
        const bounds = getObjectSelectionBounds(objectItem);
        const intersects =
          bounds.right >= rect.left &&
          bounds.left <= rect.right &&
          bounds.bottom >= rect.top &&
          bounds.top <= rect.bottom;

        if (intersects) {
          intersectingObjectIds.push(objectItem.id);
        }
      });

      return intersectingObjectIds;
    },
    [getObjectSelectionBounds],
  );

  const getConnectableAnchorPoints = useCallback(() => {
    const anchors: Array<{
      objectId: string;
      anchor: ConnectorAnchor;
      x: number;
      y: number;
    }> = [];

    objectsByIdRef.current.forEach((objectItem) => {
      if (!isConnectableShapeKind(objectItem.type)) {
        return;
      }
      const connectableType = objectItem.type;

      const geometry = getCurrentObjectGeometry(objectItem.id);
      if (!geometry) {
        return;
      }

      CONNECTOR_ANCHORS.forEach((anchor) => {
        const point = getAnchorPointForGeometry(
          geometry,
          anchor,
          connectableType,
        );
        anchors.push({
          objectId: objectItem.id,
          anchor,
          x: point.x,
          y: point.y,
        });
      });
    });

    return anchors;
  }, [getCurrentObjectGeometry]);

  const getResizedGeometry = useCallback(
    (
      state: CornerResizeState,
      clientX: number,
      clientY: number,
      scale: number,
    ): ObjectGeometry => {
      const deltaX = (clientX - state.startClientX) / scale;
      const deltaY = (clientY - state.startClientY) / scale;

      const minimumSize = getMinimumObjectSize(state.objectType);
      let nextX = state.initialGeometry.x;
      let nextY = state.initialGeometry.y;
      let nextWidth = state.initialGeometry.width;
      let nextHeight = state.initialGeometry.height;

      if (state.corner === "nw") {
        nextX = state.initialGeometry.x + deltaX;
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "ne") {
        nextY = state.initialGeometry.y + deltaY;
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height - deltaY;
      } else if (state.corner === "sw") {
        nextX = state.initialGeometry.x + deltaX;
        nextWidth = state.initialGeometry.width - deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      } else {
        nextWidth = state.initialGeometry.width + deltaX;
        nextHeight = state.initialGeometry.height + deltaY;
      }

      if (nextWidth < minimumSize.width) {
        const deficit = minimumSize.width - nextWidth;
        nextWidth = minimumSize.width;
        if (state.corner === "nw" || state.corner === "sw") {
          nextX -= deficit;
        }
      }

      if (nextHeight < minimumSize.height) {
        const deficit = minimumSize.height - nextHeight;
        nextHeight = minimumSize.height;
        if (state.corner === "nw" || state.corner === "ne") {
          nextY -= deficit;
        }
      }

      if (state.objectType === "circle") {
        const size = Math.max(
          minimumSize.width,
          Math.max(nextWidth, nextHeight),
        );
        if (state.corner === "nw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "ne") {
          nextY = state.initialGeometry.y + state.initialGeometry.height - size;
        } else if (state.corner === "sw") {
          nextX = state.initialGeometry.x + state.initialGeometry.width - size;
        }

        nextWidth = size;
        nextHeight = size;
      }

      if (
        snapToGridEnabledRef.current &&
        isSnapEligibleObjectType(state.objectType)
      ) {
        const initialRight = state.initialGeometry.x + state.initialGeometry.width;
        const initialBottom =
          state.initialGeometry.y + state.initialGeometry.height;

        if (state.objectType === "circle") {
          const snappedSize = Math.max(minimumSize.width, snapToGrid(nextWidth));
          nextWidth = snappedSize;
          nextHeight = snappedSize;

          if (state.corner === "nw") {
            nextX = initialRight - snappedSize;
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "ne") {
            nextY = initialBottom - snappedSize;
          } else if (state.corner === "sw") {
            nextX = initialRight - snappedSize;
          }
        } else {
          const snappedWidth = Math.max(minimumSize.width, snapToGrid(nextWidth));
          const snappedHeight = Math.max(
            minimumSize.height,
            snapToGrid(nextHeight),
          );

          if (state.corner === "nw" || state.corner === "sw") {
            nextX = initialRight - snappedWidth;
          }
          if (state.corner === "nw" || state.corner === "ne") {
            nextY = initialBottom - snappedHeight;
          }

          nextWidth = snappedWidth;
          nextHeight = snappedHeight;
        }
      }

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        rotationDeg: state.initialGeometry.rotationDeg,
      };
    },
    [],
  );

  const getLineGeometryFromEndpointDrag = useCallback(
    (
      state: LineEndpointResizeState,
      movingPoint: BoardPoint,
    ): ObjectGeometry => {
      const dx = movingPoint.x - state.fixedPoint.x;
      const dy = movingPoint.y - state.fixedPoint.y;
      const distance = Math.hypot(dx, dy);
      const length = Math.max(LINE_MIN_LENGTH, distance);
      const angle = distance < 0.001 ? 0 : toDegrees(Math.atan2(dy, dx));

      const normalizedX = distance < 0.001 ? 1 : dx / distance;
      const normalizedY = distance < 0.001 ? 0 : dy / distance;
      const adjustedMovingPoint = {
        x: state.fixedPoint.x + normalizedX * length,
        y: state.fixedPoint.y + normalizedY * length,
      };

      const startPoint =
        state.endpoint === "start" ? adjustedMovingPoint : state.fixedPoint;
      const endPoint =
        state.endpoint === "end" ? adjustedMovingPoint : state.fixedPoint;
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;

      return {
        x: centerX - length / 2,
        y: centerY - state.handleHeight / 2,
        width: length,
        height: state.handleHeight,
        rotationDeg: angle,
      };
    },
    [],
  );

  useBoardStageWindowPointerEvents({
    aiFooterResizeStateRef,
    cornerResizeStateRef,
    connectorEndpointDragStateRef,
    dragStateRef,
    lineEndpointResizeStateRef,
    marqueeSelectionStateRef,
    objectsByIdRef,
    panStateRef,
    rotateStateRef,
    stageRef,
    snapToGridEnabledRef,
    canEditRef,
    draftConnectorByIdRef,
    draftGeometryByIdRef,
    setDraftConnector,
    setDraftGeometry,
    setSelectedObjectIds,
    setIsObjectDragging,
    setMarqueeSelectionState,
    setIsAiFooterResizing,
    setAiFooterHeight,
    updateObjectGeometry,
    updateObjectPositionsBatch,
    updateConnectorDraft,
    clearDraftConnector,
    clearDraftGeometry,
    clearStickyTextHoldDrag,
    setViewport,
    getCurrentObjectGeometry,
    getConnectorDraftForObject,
    getConnectableAnchorPoints,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    getObjectsIntersectingRect,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    viewportRef,
    clampAiFooterHeight: clampAiFooterHeight,
  });

  const updateCursor = useCallback(
    async (cursor: BoardPoint | null, options: { force?: boolean } = {}) => {
      const writeMetrics = writeMetricsRef.current;
      writeMetrics.markAttempted("cursor");

      const force = options.force ?? false;
      const nextCursor = cursor ? toWritePoint(cursor) : null;
      const previousCursor = lastCursorWriteRef.current;

      if (!force) {
        if (nextCursor === null && previousCursor === null) {
          writeMetrics.markSkipped("cursor");
          return;
        }

        if (
          nextCursor !== null &&
          previousCursor !== null &&
          getDistance(nextCursor, previousCursor) < CURSOR_MIN_MOVE_DISTANCE
        ) {
          writeMetrics.markSkipped("cursor");
          return;
        }
      }

      try {
        await setDoc(
          selfPresenceRef,
          {
            cursorX: nextCursor?.x ?? null,
            cursorY: nextCursor?.y ?? null,
            active: true,
            lastSeenAtMs: Date.now(),
            lastSeenAt: serverTimestamp(),
          },
          { merge: true },
        );
        lastCursorWriteRef.current = nextCursor;
        writeMetrics.markCommitted("cursor");
      } catch {
        // Ignore cursor write failures to avoid interrupting interactions.
      }
    },
    [selfPresenceRef],
  );

  const createObject = useCallback(
    async (kind: BoardObjectKind) => {
      if (!canEdit) {
        return;
      }

      const stageElement = stageRef.current;
      if (!stageElement) {
        return;
      }

      const rect = stageElement.getBoundingClientRect();
      const centerX =
        (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
      const centerY =
        (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
      const defaultSize = getDefaultObjectSize(kind);
      let width = defaultSize.width;
      let height = defaultSize.height;
      if (kind === "gridContainer") {
        const viewableWidth = rect.width / viewportRef.current.scale;
        const viewableHeight = rect.height / viewportRef.current.scale;
        const minimumSize = getMinimumObjectSize(kind);
        width = Math.max(minimumSize.width, Math.round(viewableWidth * 0.9));
        height = Math.max(minimumSize.height, Math.round(viewableHeight * 0.9));
      }
      const spawnIndex =
        objectsByIdRef.current.size + objectSpawnSequenceRef.current;
      objectSpawnSequenceRef.current += 1;
      const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
      const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
        0,
      );
      const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
        (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
        0,
      );
      const nextZIndex = isBackgroundContainerType(kind)
        ? lowestZIndex - 1
        : highestZIndex + 1;
      const startXRaw = centerX - width / 2 + spawnOffset.x;
      const startYRaw = centerY - height / 2 + spawnOffset.y;
      const startX =
        snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
          ? snapToGrid(startXRaw)
          : startXRaw;
      const startY =
        snapToGridEnabledRef.current && isSnapEligibleObjectType(kind)
          ? snapToGrid(startYRaw)
          : startYRaw;
      const isConnector = isConnectorKind(kind);

      try {
        const connectorFrom = isConnector
          ? {
              x: startX,
              y: startY + height / 2,
            }
          : null;
        const connectorTo = isConnector
          ? {
              x: startX + width,
              y: startY + height / 2,
            }
          : null;
        const connectorGeometry =
          connectorFrom && connectorTo
            ? toConnectorGeometryFromEndpoints(connectorFrom, connectorTo)
            : null;

        const payload: Record<string, unknown> = {
          type: kind,
          zIndex: nextZIndex,
          x: connectorGeometry ? connectorGeometry.x : startX,
          y: connectorGeometry ? connectorGeometry.y : startY,
          width: connectorGeometry ? connectorGeometry.width : width,
          height: connectorGeometry ? connectorGeometry.height : height,
          rotationDeg: 0,
          color: getDefaultObjectColor(kind),
          text:
            kind === "sticky"
              ? "New sticky note"
              : kind === "text"
                ? "Text"
                : "",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (kind === "gridContainer") {
          const defaultSectionTitles = getDefaultSectionTitles(1, 1);
          payload.gridRows = 1;
          payload.gridCols = 1;
          payload.gridGap = GRID_CONTAINER_DEFAULT_GAP;
          payload.gridCellColors = ["transparent"];
          payload.containerTitle = "";
          payload.gridSectionTitles = defaultSectionTitles;
          payload.gridSectionNotes = Array.from(
            { length: defaultSectionTitles.length },
            () => "",
          );
        }

        if (connectorFrom && connectorTo) {
          payload.fromObjectId = null;
          payload.toObjectId = null;
          payload.fromAnchor = null;
          payload.toAnchor = null;
          payload.fromX = connectorFrom.x;
          payload.fromY = connectorFrom.y;
          payload.toX = connectorTo.x;
          payload.toY = connectorTo.y;
        }

        await addDoc(objectsCollectionRef, payload);
      } catch (error) {
        console.error("Failed to create object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to create object."));
      }
    },
    [canEdit, objectsCollectionRef, user.uid],
  );

  const showBoardStatus = useCallback((message: string) => {
    setBoardStatusMessage(message);
    if (boardStatusTimerRef.current !== null) {
      window.clearTimeout(boardStatusTimerRef.current);
    }
    boardStatusTimerRef.current = window.setTimeout(() => {
      setBoardStatusMessage(null);
      boardStatusTimerRef.current = null;
    }, 2400);
  }, []);

  const {
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
  } = useObjectTemplateActions({
    canEdit,
    db,
    objectsCollectionRef,
    userId: user.uid,
    selectedObjectIds,
    objectsByIdRef,
    copiedObjectsRef,
    copyPasteSequenceRef,
    snapToGridEnabledRef,
    setSelectedObjectIds,
    setBoardError,
  });

  const createSwotTemplate = useCallback(async () => {
    if (!canEdit) {
      return null;
    }

    const stageElement = stageRef.current;
    if (!stageElement) {
      return null;
    }

    const rect = stageElement.getBoundingClientRect();
    const centerX =
      (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
    const centerY =
      (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
    const viewableWidth = rect.width / viewportRef.current.scale;
    const viewableHeight = rect.height / viewportRef.current.scale;
    const defaultSize = getDefaultObjectSize("gridContainer");
    const minimumSize = getMinimumObjectSize("gridContainer");
    const width = Math.max(
      minimumSize.width,
      Math.min(
        2_400,
        Math.max(defaultSize.width, Math.round(viewableWidth * 0.9)),
      ),
    );
    const height = Math.max(
      minimumSize.height,
      Math.min(
        1_600,
        Math.max(defaultSize.height, Math.round(viewableHeight * 0.9)),
      ),
    );
    const spawnIndex =
      objectsByIdRef.current.size + objectSpawnSequenceRef.current;
    objectSpawnSequenceRef.current += 1;
    const spawnOffset = getSpawnOffset(spawnIndex, OBJECT_SPAWN_STEP_PX);
    const startXRaw = centerX - width / 2 + spawnOffset.x;
    const startYRaw = centerY - height / 2 + spawnOffset.y;
    const startX =
      snapToGridEnabledRef.current && isSnapEligibleObjectType("gridContainer")
        ? snapToGrid(startXRaw)
        : startXRaw;
    const startY =
      snapToGridEnabledRef.current && isSnapEligibleObjectType("gridContainer")
        ? snapToGrid(startYRaw)
        : startYRaw;
    const highestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
      (maxValue, objectItem) => Math.max(maxValue, objectItem.zIndex),
      0,
    );
    const lowestZIndex = Array.from(objectsByIdRef.current.values()).reduce(
      (minValue, objectItem) => Math.min(minValue, objectItem.zIndex),
      0,
    );
    const nextZIndex = isBackgroundContainerType("gridContainer")
      ? lowestZIndex - 1
      : highestZIndex + 1;

    try {
      const docRef = await addDoc(objectsCollectionRef, {
        type: "gridContainer",
        zIndex: nextZIndex,
        x: startX,
        y: startY,
        width,
        height,
        rotationDeg: 0,
        color: getDefaultObjectColor("gridContainer"),
        text: "",
        gridRows: 2,
        gridCols: 2,
        gridGap: 2,
        gridCellColors: [...SWOT_SECTION_COLORS],
        containerTitle: SWOT_TEMPLATE_TITLE,
        gridSectionTitles: [...DEFAULT_SWOT_SECTION_TITLES],
        gridSectionNotes: ["", "", "", ""],
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return docRef.id;
    } catch (error) {
      console.error("Failed to create SWOT template", error);
      setBoardError(toBoardErrorMessage(error, "Failed to create SWOT template."));
      return null;
    }
  }, [canEdit, objectsCollectionRef, user.uid]);

  const deleteObject = useCallback(
    async (objectId: string) => {
      if (!canEdit) {
        return;
      }

      try {
        await deleteDoc(doc(db, `boards/${boardId}/objects/${objectId}`));
        const syncState = stickyTextSyncStateRef.current.get(objectId);
        if (syncState && syncState.timerId !== null) {
          window.clearTimeout(syncState.timerId);
        }
        stickyTextSyncStateRef.current.delete(objectId);
        lastStickyWriteByIdRef.current.delete(objectId);
        lastPositionWriteByIdRef.current.delete(objectId);
        lastGeometryWriteByIdRef.current.delete(objectId);
        const gridTimerId = gridContentSyncTimerByIdRef.current.get(objectId);
        if (gridTimerId !== undefined) {
          window.clearTimeout(gridTimerId);
          gridContentSyncTimerByIdRef.current.delete(objectId);
        }
        setGridContentDraftById((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
        setTextDrafts((previous) => {
          if (!(objectId in previous)) {
            return previous;
          }

          const next = { ...previous };
          delete next[objectId];
          return next;
        });
        setSelectedObjectIds((previous) =>
          previous.filter((id) => id !== objectId),
        );
        clearDraftConnector(objectId);
      } catch (error) {
        console.error("Failed to delete object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to delete object."));
      }
    },
    [boardId, canEdit, clearDraftConnector, db],
  );

  const { flushStickyTextSync, queueStickyTextSync } = useStickyTextSync({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    lastStickyWriteByIdRef,
    stickyTextSyncStateRef,
    writeMetricsRef,
    setBoardError,
  });

  const {
    getGridDraftForObject,
    queueGridContentSync,
    saveGridContainerCellColors,
  } = useGridContentSync({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    gridContentDraftByIdRef,
    gridContentSyncTimerByIdRef,
    setGridContentDraftById,
    setBoardError,
  });

  const { updateGridContainerDimensions } = useGridDimensionUpdates({
    boardId,
    db,
    canEditRef,
    objectsByIdRef,
    getCurrentObjectGeometry,
    getGridDraftForObject,
    getSectionAnchoredObjectUpdatesForContainer,
    buildContainerMembershipPatchesForPositions,
    updateObjectPositionsBatch,
    setGridContentDraftById,
    setBoardError,
  });

  const saveSelectedObjectsColor = useCallback(
    async (color: string) => {
      if (!canEditRef.current) {
        return;
      }

      const objectIdsToUpdate = Array.from(selectedObjectIdsRef.current).filter(
        (objectId) => {
          const objectItem = objectsByIdRef.current.get(objectId);
          return objectItem ? canUseSelectionHudColor(objectItem) : false;
        },
      );
      if (objectIdsToUpdate.length === 0) {
        return;
      }

      try {
        const batch = writeBatch(db);
        const updatedAt = serverTimestamp();

        objectIdsToUpdate.forEach((objectId) => {
          batch.update(doc(db, `boards/${boardId}/objects/${objectId}`), {
            color,
            updatedAt,
          });
        });

        await batch.commit();
      } catch (error) {
        console.error("Failed to update selected object colors", error);
        setBoardError(
          toBoardErrorMessage(
            error,
            "Failed to update selected object colors.",
          ),
        );
      }
    },
    [boardId, db],
  );

  const resetSelectedObjectsRotation = useCallback(async () => {
    if (!canEditRef.current) {
      return;
    }

    const targets = Array.from(selectedObjectIdsRef.current)
      .map((objectId) => {
        const geometry = getCurrentObjectGeometry(objectId);
        if (!geometry) {
          return null;
        }

        return { objectId, geometry };
      })
      .filter(
        (
          item,
        ): item is {
          objectId: string;
          geometry: ObjectGeometry;
        } => item !== null,
      )
      .filter((item) => hasMeaningfulRotation(item.geometry.rotationDeg));

    if (targets.length === 0) {
      return;
    }

    rotateStateRef.current = null;

    targets.forEach((target) => {
      setDraftGeometry(target.objectId, {
        ...target.geometry,
        rotationDeg: 0,
      });
    });

    try {
      const batch = writeBatch(db);
      const updatedAt = serverTimestamp();

      targets.forEach((target) => {
        batch.update(doc(db, `boards/${boardId}/objects/${target.objectId}`), {
          x: target.geometry.x,
          y: target.geometry.y,
          width: target.geometry.width,
          height: target.geometry.height,
          rotationDeg: 0,
          updatedAt,
        });
      });

      await batch.commit();
    } catch (error) {
      console.error("Failed to reset selected object rotation", error);
      setBoardError(
        toBoardErrorMessage(error, "Failed to reset selected object rotation."),
      );
    } finally {
      targets.forEach((target) => {
        window.setTimeout(() => {
          clearDraftGeometry(target.objectId);
        }, 180);
      });
    }
  }, [
    boardId,
    clearDraftGeometry,
    db,
    getCurrentObjectGeometry,
    setDraftGeometry,
  ]);

  const selectSingleObject = useCallback((objectId: string) => {
    setSelectedObjectIds((previous) =>
      previous.length === 1 && previous[0] === objectId ? previous : [objectId],
    );
  }, []);

  const toggleObjectSelection = useCallback((objectId: string) => {
    setSelectedObjectIds((previous) => {
      if (previous.includes(objectId)) {
        return previous.filter((id) => id !== objectId);
      }

      return [...previous, objectId];
    });
  }, []);

  const shouldPreserveGroupSelection = useCallback((objectId: string) => {
    const currentSelectedIds = selectedObjectIdsRef.current;
    return currentSelectedIds.size > 1 && currentSelectedIds.has(objectId);
  }, []);

  const {
    handleDeleteButtonClick,
    handleToolButtonClick,
    handleAiFooterResizeStart,
  } = useBoardSelectionActions({
    canEdit,
    objects,
    selectedObjectIds,
    selectedObjectIdsRef,
    copiedObjectsRef,
    setSelectedObjectIds,
    deleteObject,
    createObject,
    copySelectedObjects,
    duplicateSelectedObjects,
    pasteCopiedObjects,
    showBoardStatus,
    aiFooterHeight,
    isAiFooterCollapsed,
    aiFooterResizeStateRef,
    setIsAiFooterResizing,
  });

  const submitAiCommandMessage = useAiCommandSubmit({
    boardId,
    user,
    stageRef,
    viewportRef,
    objectsByIdRef,
    idTokenRef,
    selectedObjectIdsRef,
    isAiSubmitting,
    setIsAiSubmitting,
    setSelectedObjectIds,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
  });

  const {
    handleAiChatSubmit,
    handleAiChatInputKeyDown,
    persistObjectLabelText,
    handleCreateSwotButtonClick,
  } = useBoardAssistantActions({
    canEdit,
    isAiSubmitting,
    isSwotTemplateCreating,
    setIsAiSubmitting,
    setIsSwotTemplateCreating,
    createSwotTemplate,
    appendAssistantMessage,
    setSelectedObjectIds,
    resetHistoryNavigation,
    submitAiCommandMessage,
    handleChatInputKeyDown,
    chatInput,
    boardId,
    objectsByIdRef,
    db,
    setObjects,
    setBoardError,
  });

  const {
    toBoardCoordinates,
    zoomAtStageCenter,
    nudgeZoom,
    handleWheel,
  } = useBoardZoomControls({
    stageRef,
    viewportRef,
    setViewport,
  });

  const handleStageWheelCapture = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      event.stopPropagation();
      handleWheel(event);
    },
    [handleWheel],
  );

  const {
    handleStagePointerDown,
    handleStagePointerMove,
    handleStagePointerLeave,
    startObjectDrag,
    startShapeRotate,
    startCornerResize,
    startLineEndpointResize,
    startConnectorEndpointDrag,
  } = useBoardStageInteractions({
    canEdit,
    setSelectedObjectIds,
    setMarqueeSelectionState,
    toBoardCoordinates,
    marqueeSelectionStateRef,
    panStateRef,
    viewportRef,
    objectsByIdRef,
    selectedObjectIdsRef,
    getCurrentObjectGeometry,
    selectSingleObject,
    toggleObjectSelection,
    dragStateRef,
    setIsObjectDragging,
    rotateStateRef,
    cornerResizeStateRef,
    lineEndpointResizeStateRef,
    connectorEndpointDragStateRef,
    setDraftConnector,
    getConnectorDraftForObject,
    setCursorBoardPosition,
    updateCursor,
    sendCursorAtRef,
  });

  const onlineUsers = useMemo(
    () =>
      getActivePresenceUsers(
        presenceUsers,
        presenceClock,
        PRESENCE_TTL_MS,
      ).sort((left, right) =>
        getPresenceLabel(left).localeCompare(getPresenceLabel(right)),
      ),
    [presenceClock, presenceUsers],
  );

  const remoteCursors = useMemo(
    () => getRemoteCursors(onlineUsers, user.uid),
    [onlineUsers, user.uid],
  );
  const activeEndpointDrag = connectorEndpointDragStateRef.current;
  const isConnectorEndpointDragging = activeEndpointDrag !== null;

  const {
    selectedObjectCount,
    connectorRoutesById,
    selectedColor,
    canColorSelection,
    canResetSelectionRotation,
    singleSelectedObject,
    canEditSelectedLabel,
    canShowSelectionHud,
    commitSelectionLabelDraft,
    selectionHudPosition,
    hasDeletableSelection,
    shouldShowConnectorAnchors,
    connectorAnchorPoints,
  } = useSelectionUiState({
    canEdit,
    objects,
    draftGeometryById,
    draftConnectorById,
    selectedObjectIds,
    stageSize,
    viewport,
    activeEndpointDrag,
    isConnectorEndpointDragging,
    getConnectableAnchorPoints,
    selectionLabelDraft,
    setSelectionLabelDraft,
    persistObjectLabelText,
    objectLabelMaxLength: OBJECT_LABEL_MAX_LENGTH,
    selectionHudSize,
    selectionHudRef,
    setSelectionHudSize,
  });

  const zoomPercent = Math.round(viewport.scale * 100);
  const fpsTarget = 60;
  const fpsTone =
    fps >= 55 ? "#16a34a" : fps >= 45 ? "#d97706" : "#dc2626";
  const zoomSliderValue = Math.min(
    ZOOM_SLIDER_MAX_PERCENT,
    Math.max(ZOOM_SLIDER_MIN_PERCENT, zoomPercent),
  );
  const marqueeRect = marqueeSelectionState
    ? toNormalizedRect(
        marqueeSelectionState.startPoint,
        marqueeSelectionState.currentPoint,
      )
    : null;
  const gridAxisLabels = useGridAxisLabels(stageSize, viewport);

  return (
    <section
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `${isLeftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH}px ${PANEL_SEPARATOR_WIDTH}px minmax(0, 1fr) ${PANEL_SEPARATOR_WIDTH}px ${isRightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH}px`,
          transition: `grid-template-columns ${PANEL_COLLAPSE_ANIMATION}`,
        }}
      >
        <LeftToolsPanel
          isCollapsed={isLeftPanelCollapsed}
          canEdit={canEdit}
          isAiSubmitting={isAiSubmitting}
          isSwotTemplateCreating={isSwotTemplateCreating}
          hasDeletableSelection={hasDeletableSelection}
          selectedObjectCount={selectedObjectCount}
          resolvedTheme={resolvedTheme}
          onCollapse={() => setIsLeftPanelCollapsed(true)}
          onExpand={() => setIsLeftPanelCollapsed(false)}
          onToolButtonClick={handleToolButtonClick}
          onCreateSwot={handleCreateSwotButtonClick}
          onDuplicate={() => {
            void duplicateSelectedObjects();
          }}
          onDelete={handleDeleteButtonClick}
        >
          <LeftToolsPanelControls
            zoomSliderMin={ZOOM_SLIDER_MIN_PERCENT}
            zoomSliderMax={ZOOM_SLIDER_MAX_PERCENT}
            zoomSliderValue={zoomSliderValue}
            zoomPercent={zoomPercent}
            selectedObjectCount={selectedObjectCount}
            isSnapToGridEnabled={isSnapToGridEnabled}
            cursorBoardPosition={cursorBoardPosition}
            boardError={boardError}
            boardStatusMessage={boardStatusMessage}
            onResetView={() => setViewport(INITIAL_VIEWPORT)}
            onNudgeZoomOut={() => nudgeZoom("out")}
            onNudgeZoomIn={() => nudgeZoom("in")}
            onZoomSliderChange={zoomAtStageCenter}
            onSnapToGridToggle={setIsSnapToGridEnabled}
          />
        </LeftToolsPanel>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <StageSurface
            stageRef={stageRef}
            selectionHudRef={selectionHudRef}
            stageSize={stageSize}
            viewport={viewport}
            gridAxisLabels={gridAxisLabels}
            canEdit={canEdit}
            isObjectDragging={isObjectDragging}
            objects={objects}
            draftGeometryById={draftGeometryById}
            textDrafts={textDrafts}
            selectedObjectIds={selectedObjectIds}
            connectorRoutesById={connectorRoutesById}
            resolvedTheme={resolvedTheme}
            connectorEndpointDragObjectId={
              connectorEndpointDragStateRef.current?.objectId ?? null
            }
            shouldShowConnectorAnchors={shouldShowConnectorAnchors}
            connectorAnchorPoints={connectorAnchorPoints}
            marqueeRect={marqueeRect}
            remoteCursors={remoteCursors}
            fps={fps}
            fpsTone={fpsTone}
            fpsTarget={fpsTarget}
            canShowSelectionHud={canShowSelectionHud}
            selectionHudPosition={selectionHudPosition}
            canColorSelection={canColorSelection}
            selectedColor={selectedColor}
            canResetSelectionRotation={canResetSelectionRotation}
            canEditSelectedLabel={canEditSelectedLabel}
            selectionLabelDraft={selectionLabelDraft}
            singleSelectedObject={singleSelectedObject}
            stickyTextHoldDragRef={stickyTextHoldDragRef}
            handleStagePointerDown={handleStagePointerDown}
            handleStagePointerMove={handleStagePointerMove}
            handleStagePointerLeave={handleStagePointerLeave}
            setSelectionLabelDraft={setSelectionLabelDraft}
            saveSelectedObjectsColor={saveSelectedObjectsColor}
            resetSelectedObjectsRotation={resetSelectedObjectsRotation}
            commitSelectionLabelDraft={commitSelectionLabelDraft}
            persistObjectLabelText={persistObjectLabelText}
            shouldPreserveGroupSelection={shouldPreserveGroupSelection}
            selectSingleObject={selectSingleObject}
            toggleObjectSelection={toggleObjectSelection}
            startObjectDrag={startObjectDrag}
            startShapeRotate={startShapeRotate}
            startCornerResize={startCornerResize}
            startLineEndpointResize={startLineEndpointResize}
            startConnectorEndpointDrag={startConnectorEndpointDrag}
            updateGridContainerDimensions={updateGridContainerDimensions}
            getGridDraftForObject={getGridDraftForObject}
            queueGridContentSync={queueGridContentSync}
            saveGridContainerCellColors={saveGridContainerCellColors}
            clearStickyTextHoldDrag={clearStickyTextHoldDrag}
            setTextDrafts={setTextDrafts}
            queueStickyTextSync={queueStickyTextSync}
            flushStickyTextSync={flushStickyTextSync}
            handleWheel={handleWheel}
            onWheelCapture={handleStageWheelCapture}
          />
        </div>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <RightPresencePanel
          isCollapsed={isRightPanelCollapsed}
          onlineUsers={onlineUsers}
          onCollapse={() => setIsRightPanelCollapsed(true)}
          onExpand={() => setIsRightPanelCollapsed(false)}
        />
      </div>

      <AiAssistantFooter
        isCollapsed={isAiFooterCollapsed}
        isResizing={isAiFooterResizing}
        isDrawerNudgeActive={isAiDrawerNudgeActive}
        height={aiFooterHeight}
        selectedCount={selectedObjectIds.length}
        chatMessages={chatMessages}
        isSubmitting={isAiSubmitting}
        chatInput={chatInput}
        chatMessagesRef={chatMessagesRef}
        onResizeStart={handleAiFooterResizeStart}
        onToggleCollapsed={() => {
          setHasAiDrawerBeenInteracted(true);
          setIsAiFooterResizing(false);
          setIsAiFooterCollapsed((previous) => !previous);
        }}
        onSubmit={handleAiChatSubmit}
        onInputChange={handleChatInputChange}
        onInputKeyDown={handleAiChatInputKeyDown}
      />
    </section>
  );
}
