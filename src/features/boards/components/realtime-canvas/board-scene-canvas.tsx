/* eslint-disable max-lines */
/* eslint-disable max-lines-per-function */
"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  type FormEvent,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { User } from "firebase/auth";

import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { sendBoardAiCommand } from "@/features/boards/components/realtime-canvas/ai-command-client";
import {
  AI_HELP_MESSAGE,
  AI_WELCOME_MESSAGE,
  type ChatMessage,
} from "@/features/boards/components/realtime-canvas/ai-chat-content";
import { isLocalAiHelpCommand, useAiChatState } from "@/features/boards/components/realtime-canvas/use-ai-chat-state";
import LabelEditorOverlay from "@/features/boards/components/realtime-canvas/canvas-label-editor-overlay";
import type { BoardObject, BoardObjectKind, BoardPermissions } from "@/features/boards/types";
import {
  CANVAS_ACTION_BUTTON_STYLE,
  clamp,
  toCanvasPointString,
  type Viewport,
  useObservedSize,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/features/boards/components/realtime-canvas/board-scene-utils";
import {
  getDefaultObjectColor,
  getDefaultObjectSize,
} from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  drawBoardObject,
  drawCanvasGrid,
  drawSelectionRing,
  type DrawContext,
} from "@/features/boards/components/realtime-canvas/canvas-draw-primitives";
import { drawGridContainerSections } from "@/features/boards/components/realtime-canvas/canvas-grid-container-draw";
import { drawConnectorRoute } from "@/features/boards/components/realtime-canvas/canvas-connector-draw";
import {
  getObjectHitTarget,
  projectClientToBoard,
  toCanvasPoint,
  type CanvasPoint,
} from "@/features/boards/components/realtime-canvas/canvas-hit-test";
import { buildConnectorRouteEngine } from "@/features/boards/components/realtime-canvas/use-connector-routing-engine";
import {
  BOARD_SCENE_CANVAS_PARSER_OPTIONS,
  BOARD_SCENE_RENDER_TYPES,
  type BoardObjectParserOptions,
} from "@/features/boards/components/realtime-canvas/board-scene-utils";
import { toBoardObject } from "@/features/boards/components/realtime-canvas/board-doc-parsers";
import type { ViewportBounds } from "@/features/ai/types";

const parserOptions: BoardObjectParserOptions = BOARD_SCENE_CANVAS_PARSER_OPTIONS;

type DragMode = "none" | "pan" | "move";

type DragState = {
  mode: DragMode;
  objectId: string | null;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBoardX: number;
  startBoardY: number;
  startViewportX: number;
  startViewportY: number;
  movingObjectIds: string[];
  initialPositions: Map<string, { x: number; y: number }>;
};

type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

const CANVAS_TOOLBAR_BUTTONS: {
  kind: BoardObjectKind;
  label: string;
}[] = [
  { kind: "sticky", label: "Sticky" },
  { kind: "text", label: "Text" },
  { kind: "rect", label: "Rect" },
  { kind: "circle", label: "Circle" },
  { kind: "triangle", label: "Triangle" },
  { kind: "star", label: "Star" },
  { kind: "line", label: "Line" },
  { kind: "gridContainer", label: "Frame" },
];

function isReadOnly(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName.toLowerCase();
  const inputTypes = ["input", "textarea", "select"]; 
  return inputTypes.includes(tagName) || target.isContentEditable;
}

function resolveViewportBounds(
  stage: HTMLDivElement | null,
  viewport: Viewport,
): ViewportBounds {
  return {
    left: stage ? -viewport.x / Math.max(viewport.scale, 0.0001) : 0,
    top: stage ? -viewport.y / Math.max(viewport.scale, 0.0001) : 0,
    width: stage ? stage.clientWidth / Math.max(viewport.scale, 0.0001) : 0,
    height: stage ? stage.clientHeight / Math.max(viewport.scale, 0.0001) : 0,
  };
}

export default function BoardSceneCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps): React.ReactElement {
  const { resolvedTheme } = useTheme();
  const db = getFirebaseClientDb();
  const canEdit = permissions.canEdit;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectsRef = useRef<BoardObject[]>([]);
  const selectedObjectIdsRef = useRef<string[]>([]);
  const dragStateRef = useRef<DragState | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [selectedObjectIds, setSelectedObjectIds] = useState<string[]>([]);
  const [editingObjectId, setEditingObjectId] = useState<string | null>(null);
  const [isAiSubmitting, setIsAiSubmitting] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 20, y: 20, scale: 1 });
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [viewportReady, setViewportReady] = useState(false);
  const { width: containerWidth, height: containerHeight } = useObservedSize(
    containerRef as RefObject<HTMLElement>,
  );
  const connectorRouteEngine = useMemo(() => buildConnectorRouteEngine(), []);
  const {
    chatMessages,
    chatInput,
    appendUserMessage,
    appendAssistantMessage,
    clearChatInputForSubmit,
    resetHistoryNavigation,
    handleChatInputChange,
    handleChatInputKeyDown,
  } = useAiChatState({ welcomeMessage: AI_WELCOME_MESSAGE });

  const boardObjectById = useMemo(() => {
    const map = new Map<string, BoardObject>();
    for (const objectItem of objects) {
      map.set(objectItem.id, objectItem);
    }
    return map;
  }, [objects]);

  useEffect(() => {
    selectedObjectIdsRef.current = selectedObjectIds;
  }, [selectedObjectIds]);

  useEffect(() => {
    const boardQuery = query(
      collection(db, "boards", boardId, "objects"),
      orderBy("zIndex", "asc"),
    );

    const unsubscribe = onSnapshot(
      boardQuery,
      (snapshot) => {
        const next = snapshot.docs
          .map((snapshotItem) =>
            toBoardObject(snapshotItem.id, snapshotItem.data(), parserOptions),
          )
          .filter((item): item is BoardObject => item !== null)
          .sort((left, right) => left.zIndex - right.zIndex);
        setObjects(next);
        objectsRef.current = next;
        setLoadingError(null);
      },
      () => {
        setLoadingError("Failed to sync objects.");
      },
    );

    return () => unsubscribe();
  }, [boardId, db]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const node = containerRef.current;
    if (!canvas || !node || containerWidth <= 1 || containerHeight <= 1) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const width = containerWidth * dpr;
    const height = containerHeight * dpr;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      setViewportReady(true);
    }

    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;
    canvas.style.background =
      resolvedTheme === "dark" ? "#020617" : "#eef2ff";

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawCanvasGrid(context, containerWidth, containerHeight);

    const drawContext: DrawContext = {
      ctx: context,
      viewport,
      theme: resolvedTheme,
    };

    const ordered = [...objects]
      .filter((objectItem) => BOARD_SCENE_RENDER_TYPES.has(objectItem.type))
      .sort((left, right) => left.zIndex - right.zIndex);

    for (const objectItem of ordered) {
      if (objectItem.type === "gridContainer") {
        drawGridContainerSections(context, objectItem, viewport);
      }
      if (
        objectItem.type === "connectorArrow" ||
        objectItem.type === "connectorUndirected" ||
        objectItem.type === "connectorBidirectional"
      ) {
        continue;
      }
      drawBoardObject(drawContext, objectItem);
    }

    const connectors = ordered.filter(
      (objectItem) =>
        objectItem.type === "connectorArrow" ||
        objectItem.type === "connectorUndirected" ||
        objectItem.type === "connectorBidirectional",
    );
    const connectorLookup = new Map<string, BoardObject>(
      objects.map((objectItem) => [objectItem.id, objectItem]),
    );

    for (const connector of connectors) {
      const from = connector.fromObjectId
        ? connectorLookup.get(connector.fromObjectId)
        : null;
      const to = connector.toObjectId
        ? connectorLookup.get(connector.toObjectId)
        : null;
      if (!from || !to) {
        continue;
      }
      const route = connectorRouteEngine.resolveRoute(
        connector.id,
        from,
        to,
        objects,
        containerWidth,
        containerHeight,
        viewport,
      );
      if (route) {
        drawConnectorRoute(context, route, from, to, viewport);
      }
    }

    for (const selectedObjectId of selectedObjectIds) {
      const selected = boardObjectById.get(selectedObjectId);
      if (selected) {
        drawSelectionRing(drawContext, selected);
      }
    }

    const selected = selectedObjectIds[0]
      ? boardObjectById.get(selectedObjectIds[0]) ?? null
      : null;
    if (selected) {
      const topLeft = toCanvasPoint(selected.x, selected.y, viewport);
      context.fillStyle = "rgba(0,0,0,0.05)";
      context.fillRect(
        topLeft.x - 4,
        topLeft.y - 4,
        selected.width + 8,
        selected.height + 8,
      );
    }
  }, [containerHeight, containerWidth, connectorRouteEngine, objects, resolvedTheme, selectedObjectIds, viewport, boardObjectById]);

  const projectPointer = useCallback(
    (clientX: number, clientY: number): CanvasPoint => {
      const node = containerRef.current;
      if (!node) {
        return { x: 0, y: 0 };
      }
      const rect = node.getBoundingClientRect();
      return projectClientToBoard(
        clientX - rect.left,
        clientY - rect.top,
        viewport,
      );
    },
    [viewport],
  );

  const clampViewport = useCallback(
    (next: Viewport): Viewport => ({
      x: next.x,
      y: next.y,
      scale: clamp(next.scale, ZOOM_MIN, ZOOM_MAX),
    }),
    [],
  );

  const adjustZoom = useCallback(
    (clientX: number, clientY: number, deltaY: number) => {
      const node = containerRef.current;
      if (!node) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const boardPoint = projectClientToBoard(
        clientX - rect.left,
        clientY - rect.top,
        viewport,
      );
      const nextScale = clamp(
        viewport.scale + Math.sign(deltaY) * -ZOOM_STEP,
        ZOOM_MIN,
        ZOOM_MAX,
      );
      setViewport(
        clampViewport({
          scale: nextScale,
          x: clientX - rect.left - boardPoint.x * nextScale,
          y: clientY - rect.top - boardPoint.y * nextScale,
        }),
      );
    },
    [clampViewport, viewport],
  );

  const createObjectAt = useCallback(
    async (type: BoardObjectKind) => {
      if (!canEdit) {
        return;
      }

      const collectionRef = collection(db, "boards", boardId, "objects");
      const defaultSize = getDefaultObjectSize(type);
      const viewportOriginX = -viewport.x / Math.max(viewport.scale, 0.0001) + 40;
      const viewportOriginY = -viewport.y / Math.max(viewport.scale, 0.0001) + 80;

      try {
        await addDoc(collectionRef, {
          type,
          zIndex: Date.now(),
          x: Math.round(viewportOriginX),
          y: Math.round(viewportOriginY),
          width: defaultSize.width,
          height: defaultSize.height,
          rotationDeg: 0,
          color: getDefaultObjectColor(type),
          text: type === "sticky" ? "New sticky note" : type === "text" ? "" : "",
          fromObjectId: null,
          toObjectId: null,
          fromAnchor: null,
          toAnchor: null,
          containerId: null,
          containerSectionIndex: null,
          gridRows: type === "gridContainer" ? 2 : null,
          gridCols: type === "gridContainer" ? 2 : null,
          gridGap: type === "gridContainer" ? 2 : null,
          gridCellColors: null,
          containerTitle: type === "gridContainer" ? "Frame" : null,
          gridSectionTitles: null,
          gridSectionNotes: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        });
      } catch {
        setLoadingError("Failed to create object.");
      }
    },
    [boardId, canEdit, db, viewport.scale, viewport.x, viewport.y],
  );

  const setSelectionFromClick = useCallback(
    (objectId: string | null, multiSelect: boolean) => {
      if (!objectId) {
        setSelectedObjectIds([]);
        return;
      }

      if (!multiSelect) {
        setSelectedObjectIds([objectId]);
        return;
      }

      setSelectedObjectIds((previous) => {
        if (previous.includes(objectId)) {
          return previous.filter((id) => id !== objectId);
        }
        return [...previous, objectId];
      });
    },
    [],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      const worldPoint = projectPointer(event.clientX, event.clientY);
      const hit = getObjectHitTarget(objectsRef.current, worldPoint);
      const multiSelect = event.shiftKey;

      const nextMode = hit.type === "object" && canEdit ? "move" : "pan";
      const movingObjectIds =
        hit.type === "object" && hit.objectId && canEdit
          ? multiSelect && selectedObjectIdsRef.current.includes(hit.objectId)
            ? selectedObjectIdsRef.current
            : [hit.objectId]
          : [];
      const initialPositions = new Map<string, { x: number; y: number }>();
      for (const objectId of movingObjectIds) {
        const selectedObject = boardObjectById.get(objectId);
        if (selectedObject) {
          initialPositions.set(objectId, {
            x: selectedObject.x,
            y: selectedObject.y,
          });
        }
      }

      const dragState: DragState = {
        mode: nextMode,
        objectId: hit.type === "object" ? hit.objectId : null,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBoardX: worldPoint.x,
        startBoardY: worldPoint.y,
        startViewportX: viewport.x,
        startViewportY: viewport.y,
        movingObjectIds,
        initialPositions,
      };

      if (hit.type === "object" && hit.objectId) {
        const clicked = boardObjectById.get(hit.objectId);
        if (clicked) {
          setSelectionFromClick(clicked.id, multiSelect);
        }
      } else {
        setSelectionFromClick(null, false);
      }

      dragStateRef.current = dragState;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    },
    [boardObjectById, canEdit, projectPointer, setSelectionFromClick, viewport],
  );

  const commitObjectMoves = useCallback(
    async (moves: Array<{ id: string; x: number; y: number }>) => {
      if (!canEdit) {
        return;
      }
      try {
        await Promise.all(
          moves.map((move) =>
            updateDoc(doc(db, "boards", boardId, "objects", move.id), {
              x: Math.round(move.x),
              y: Math.round(move.y),
              updatedAt: serverTimestamp(),
            }),
          ),
        );
      } catch {
        setLoadingError("Failed to move object.");
      }
    },
    [boardId, canEdit, db],
  );

  const handleCanvasPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      const worldPoint = projectPointer(event.clientX, event.clientY);
      if (dragState.mode === "pan") {
        setViewport(
          clampViewport({
            x: dragState.startViewportX + (event.clientX - dragState.startClientX),
            y: dragState.startViewportY + (event.clientY - dragState.startClientY),
            scale: viewport.scale,
          }),
        );
        return;
      }

      if (dragState.mode !== "move" || !dragState.objectId) {
        return;
      }

      const deltaX = worldPoint.x - dragState.startBoardX;
      const deltaY = worldPoint.y - dragState.startBoardY;
      const nextObjects = objectsRef.current.map((objectItem) => {
        const start = dragState.initialPositions.get(objectItem.id);
        if (!start) {
          return objectItem;
        }

        return {
          ...objectItem,
          x: start.x + deltaX,
          y: start.y + deltaY,
        };
      });
      objectsRef.current = nextObjects;
      setObjects(nextObjects);
    },
    [clampViewport, projectPointer, viewport.scale],
  );

  const handleCanvasPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) {
        return;
      }

      dragStateRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);

      if (dragState.mode === "move" && dragState.objectId && canEdit) {
        const moves = dragState.movingObjectIds
          .map((objectId) => {
            const objectItem = boardObjectById.get(objectId);
            if (!objectItem) {
              return null;
            }
            return {
              id: objectId,
              x: objectItem.x,
              y: objectItem.y,
            };
          })
          .filter((item): item is { id: string; x: number; y: number } => item !== null);

        if (moves.length > 0) {
          void commitObjectMoves(moves);
        }
      }
    },
    [boardObjectById, canEdit, commitObjectMoves],
  );

  const handleCanvasWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      adjustZoom(event.clientX, event.clientY, event.deltaY);
    },
    [adjustZoom],
  );

  const applySelectionUpdate = useCallback((selectionUpdate?: {
    mode: "clear" | "replace";
    objectIds: string[];
  }) => {
    if (!selectionUpdate) {
      return;
    }

    const objectIdsInBoard = new Set(objectsRef.current.map((objectItem) => objectItem.id));
    const next = Array.from(
      new Set(selectionUpdate.objectIds.map((item) => item.trim()).filter(Boolean)),
    ).filter((objectId) => objectIdsInBoard.has(objectId));

    if (selectionUpdate.mode === "clear") {
      setSelectedObjectIds([]);
      return;
    }

    setSelectedObjectIds(next);
  }, []);

  const submitAiCommandMessage = useCallback(
    async (nextMessage: string) => {
      const trimmedMessage = nextMessage.trim();
      if (trimmedMessage.length === 0 || isAiSubmitting) {
        return;
      }

      appendUserMessage(trimmedMessage);
      clearChatInputForSubmit();

      if (isLocalAiHelpCommand(trimmedMessage)) {
        appendAssistantMessage(AI_HELP_MESSAGE);
        resetHistoryNavigation();
        return;
      }

      setIsAiSubmitting(true);

      try {
        const idToken = idTokenRef.current ?? (await user.getIdToken());
        idTokenRef.current = idToken;
        const viewportBounds = resolveViewportBounds(
          containerRef.current,
          viewport,
        );

        const result = await sendBoardAiCommand({
          boardId,
          message: trimmedMessage,
          idToken,
          selectedObjectIds: selectedObjectIdsRef.current,
          viewportBounds,
        });

        applySelectionUpdate(result.selectionUpdate);
        appendAssistantMessage(result.assistantMessage);
        resetHistoryNavigation();
      } catch {
        appendAssistantMessage("AI request failed. Please try again.");
      } finally {
        setIsAiSubmitting(false);
      }
  },
    [
      appendAssistantMessage,
      appendUserMessage,
      boardId,
      clearChatInputForSubmit,
      isAiSubmitting,
      applySelectionUpdate,
      resetHistoryNavigation,
      user,
      viewport,
    ],
  );

  const handleAiSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void submitAiCommandMessage(chatInput);
    },
    [chatInput, submitAiCommandMessage],
  );

  const deleteSelected = useCallback(async () => {
    if (!canEdit || selectedObjectIds.length === 0) {
      return;
    }

    const current = [...selectedObjectIds];
    setSelectedObjectIds([]);
    try {
      await Promise.all(
        current.map((objectId) => deleteDoc(doc(db, "boards", boardId, "objects", objectId)),
        ),
      );
    } catch {
      setLoadingError("Failed to delete selection.");
    }
  }, [boardId, canEdit, db, selectedObjectIds]);

  const startLabelEdit = useCallback((objectId: string) => {
    const target = boardObjectById.get(objectId);
    if (!target || !target.text && target.type !== "sticky" && target.type !== "text") {
      return;
    }

    setEditingObjectId(objectId);
  }, [boardObjectById]);

  const saveLabelText = useCallback(
    async (nextText: string) => {
      const objectId = editingObjectId;
      if (!objectId) {
        return;
      }
      const target = boardObjectById.get(objectId);
      if (!target || !canEdit) {
        return;
      }

      if (target.text === nextText) {
        setEditingObjectId(null);
        return;
      }

      setObjects((previous) =>
        previous.map((objectItem) =>
          objectItem.id === objectId
            ? {
                ...objectItem,
                text: nextText,
              }
            : objectItem,
        ),
      );

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: nextText,
          updatedAt: serverTimestamp(),
        });
      } catch {
        setLoadingError("Failed to update text.");
      }

      setEditingObjectId(null);
    },
    [boardObjectById, boardId, canEdit, db, editingObjectId],
  );

  useEffect(() => {
    if (!canEdit) {
      return;
    }

  const listener = (event: KeyboardEvent) => {
      if (event.key === "Delete" || event.key === "Backspace") {
        if (isReadOnly(event)) {
          return;
        }
        event.preventDefault();
        void deleteSelected();
      }
    };

    window.addEventListener("keydown", listener);
    return () => {
      window.removeEventListener("keydown", listener);
    };
  }, [canEdit, deleteSelected]);

  const selectedForEditor = editingObjectId
    ? boardObjectById.get(editingObjectId) ?? null
    : null;
  const editorCoordinates = useMemo(() => {
    if (!selectedForEditor) {
      return null;
    }
    const point = toCanvasPoint(
      selectedForEditor.x,
      selectedForEditor.y,
      viewport,
    );
    return { left: point.x + 12, top: point.y + 12 };
  }, [selectedForEditor, viewport]);

  return (
    <main
      ref={containerRef}
      tabIndex={-1}
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        touchAction: "none",
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerUp}
      onWheel={handleCanvasWheel}
      onDoubleClick={() => {
        if (!canEdit || selectedObjectIds.length !== 1) {
          return;
        }
        const target = boardObjectById.get(selectedObjectIds[0]);
        if (!target || !target.text) {
          return;
        }
        startLabelEdit(target.id);
      }}
      aria-label="Board canvas"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 12,
          top: 12,
          right: 12,
          zIndex: 3,
          display: "flex",
          gap: "0.35rem",
          alignItems: "center",
          flexWrap: "wrap",
          pointerEvents: "auto",
        }}
      >
        {CANVAS_TOOLBAR_BUTTONS.map((entry) => (
          <button
            key={entry.kind}
            type="button"
            onClick={() => {
              void createObjectAt(entry.kind);
            }}
            style={CANVAS_ACTION_BUTTON_STYLE}
            title={`Create ${entry.label}`}
          >
            + {entry.label[0]}
          </button>
        ))}

        <button
          type="button"
          onClick={() => {
            void deleteSelected();
          }}
          style={CANVAS_ACTION_BUTTON_STYLE}
          title="Delete selected"
        >
          Del
        </button>

        <span
          style={{
            marginLeft: "auto",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "var(--surface-muted)",
            color: "var(--text-muted)",
            padding: "0.3rem 0.6rem",
            fontSize: 11,
          }}
        >
          canvas · scale {toCanvasPointString({ x: viewport.scale, y: viewport.scale })} ·
          {objects.length} objects
          {!canEdit ? " · read-only" : ""}
        </span>
      </div>

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 4,
          borderTop: "1px solid var(--border)",
          background: "rgba(255,255,255,0.92)",
          color: "var(--text)",
          padding: "0.4rem 0.6rem",
          maxHeight: "36vh",
          minHeight: "10rem",
          display: "grid",
          gridTemplateRows: "auto 1fr",
          gap: "0.35rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          <strong>AI Assistant</strong>
          <span>
            natural language first · {chatMessages.length > 0 ? `${chatMessages.length} msgs` : "ready"}
          </span>
        </div>

        <div
          style={{
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            fontSize: 12,
            paddingRight: "0.2rem",
          }}
        >
          {chatMessages.map((message: ChatMessage) => (
            <div
              key={message.id}
              style={{
                alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
              }}
            >
              <div
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "0.45rem 0.6rem",
                  background:
                    message.role === "user"
                      ? "var(--chat-user-bubble)"
                      : "var(--chat-ai-bubble)",
                  color: "var(--text)",
                  whiteSpace: "pre-wrap",
                  lineHeight: 1.35,
                }}
              >
                {message.text}
              </div>
            </div>
          ))}
          {isAiSubmitting ? <div style={{ color: "var(--text-muted)" }}>Thinking…</div> : null}
        </div>

        <form
          onSubmit={handleAiSubmit}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: "0.4rem",
          }}
        >
          <input
            value={chatInput}
            onChange={handleChatInputChange}
            onKeyDown={(event) => {
              handleChatInputKeyDown(event, isAiSubmitting);
            }}
            disabled={isAiSubmitting}
            placeholder="Ask the AI assistant to update this board..."
            style={{
              width: "100%",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              padding: "0.42rem 0.55rem",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={isAiSubmitting || chatInput.trim().length === 0}
            style={{
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: isAiSubmitting ? "#9ca3af" : "#2563eb",
              color: "white",
              padding: "0 0.6rem",
              fontWeight: 600,
            }}
          >
            Send
          </button>
        </form>
      </div>

      {selectedForEditor && editorCoordinates && (
        <LabelEditorOverlay
          visible
          left={editorCoordinates.left}
          top={editorCoordinates.top}
          text={selectedForEditor.text}
          onSubmit={saveLabelText}
          onClose={() => {
            setEditingObjectId(null);
          }}
        />
      )}

      {loadingError ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: 56,
            borderRadius: 8,
            padding: "0.45rem 0.65rem",
            background: "#fef3c7",
            border: "1px solid #f59e0b",
            color: "#78350f",
            fontSize: 12,
            fontWeight: 600,
            zIndex: 5,
          }}
        >
          {loadingError}
        </div>
      ) : null}

      {!viewportReady ? null : null}
    </main>
  );
}
