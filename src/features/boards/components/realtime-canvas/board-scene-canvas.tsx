"use client";

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  type PointerEvent,
  type WheelEvent,
  useCallback,
  useMemo,
  useEffect,
  type RefObject,
  useRef,
  useState,
} from "react";
import type { User } from "firebase/auth";

import { getDefaultObjectColor } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import {
  type BoardObject,
  type BoardObjectKind,
  type BoardPermissions,
} from "@/features/boards/types";
import {
  drawBoardObject,
  drawCanvasGrid,
  drawSelectionRing,
  type DrawContext,
} from "@/features/boards/components/realtime-canvas/canvas-draw-primitives";
import { drawConnectorRoute } from "@/features/boards/components/realtime-canvas/canvas-connector-draw";
import { drawGridContainerSections } from "@/features/boards/components/realtime-canvas/canvas-grid-container-draw";
import {
  getObjectHitTarget,
  projectClientToBoard,
  type CanvasPoint,
} from "@/features/boards/components/realtime-canvas/canvas-hit-test";
import { buildConnectorRouteEngine } from "@/features/boards/components/realtime-canvas/use-connector-routing-engine";
import {
  BOARD_SCENE_CANVAS_PARSER_OPTIONS,
  BOARD_SCENE_RENDER_TYPES,
  CANVAS_ACTION_BUTTON_STYLE,
  clamp,
  roundCanvasPoint,
  toCanvasPointString,
  type Viewport,
  useObservedSize,
  type BoardObjectParserOptions,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from "@/features/boards/components/realtime-canvas/board-scene-utils";
import { useTheme } from "@/features/theme/use-theme";
import { getFirebaseClientDb } from "@/lib/firebase/client";
import { toBoardObject } from "@/features/boards/components/realtime-canvas/board-doc-parsers";

const parserOptions: BoardObjectParserOptions = BOARD_SCENE_CANVAS_PARSER_OPTIONS;

type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

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
  initialObjectX: number;
  initialObjectY: number;
};

export default function BoardSceneCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  void user;
  const { resolvedTheme } = useTheme();
  const db = getFirebaseClientDb();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const objectsRef = useRef<BoardObject[]>([]);
  const dragStateRef = useRef<DragState | null>(null);
  const connectorRouteEngine = useMemo(() => buildConnectorRouteEngine(), []);

  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 20, y: 20, scale: 1 });
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const { width: containerWidth, height: containerHeight } = useObservedSize(
    containerRef as RefObject<HTMLElement>,
  );

  const canEdit = permissions.canEdit;

  const boardObjectById = useMemo(() => {
    const index = new Map<string, BoardObject>();
    for (const objectItem of objects) {
      index.set(objectItem.id, objectItem);
    }
    return index;
  }, [objects]);

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
          .sort((left: BoardObject, right: BoardObject) => left.zIndex - right.zIndex);

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
    if (!canvas) {
      return;
    }

    if (containerWidth <= 1 || containerHeight <= 1) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const devicePixelRatio = window.devicePixelRatio || 1;
    const width = containerWidth * devicePixelRatio;
    const height = containerHeight * devicePixelRatio;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    canvas.style.width = `${containerWidth}px`;
    canvas.style.height = `${containerHeight}px`;

    context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    drawCanvasGrid(context, containerWidth, containerHeight);

    const drawContext: DrawContext = {
      ctx: context,
      viewport,
      theme: resolvedTheme,
    };

    const ordered = [...objects].filter((objectItem) =>
      BOARD_SCENE_RENDER_TYPES.has(objectItem.type),
    );

    for (const objectItem of ordered) {
      if (objectItem.type === "gridContainer") {
        drawGridContainerSections(context, objectItem, viewport);
      }
      if (objectItem.type !== "connectorArrow" && objectItem.type !== "connectorUndirected" && objectItem.type !== "connectorBidirectional") {
        drawBoardObject(drawContext, objectItem);
      }
    }

    const connectors = ordered.filter(
      (objectItem) =>
        objectItem.type === "connectorArrow" ||
        objectItem.type === "connectorUndirected" ||
        objectItem.type === "connectorBidirectional",
    );
    const connectorLookup = new Map<string, BoardObject>(objects.map((item) => [item.id, item]));
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

    if (selectedObjectId) {
      const selected = boardObjectById.get(selectedObjectId) ?? null;
      if (selected) {
        drawSelectionRing(drawContext, selected);
      }
    }
  }, [
    containerHeight,
    containerWidth,
    objects,
    resolvedTheme,
    selectedObjectId,
    viewport,
    boardObjectById,
    connectorRouteEngine,
  ]);

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

  const clampViewport = useCallback((next: Viewport): Viewport => ({
    x: roundCanvasPoint(next.x),
    y: roundCanvasPoint(next.y),
    scale: roundCanvasPoint(clamp(next.scale, ZOOM_MIN, ZOOM_MAX)),
  }), []);

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
      const next: Viewport = {
        scale: nextScale,
        x: roundCanvasPoint(clientX - rect.left - boardPoint.x * nextScale),
        y: roundCanvasPoint(clientY - rect.top - boardPoint.y * nextScale),
      };
      setViewport(clampViewport(next));
    },
    [clampViewport, viewport],
  );

  const createObjectAt = useCallback(
    async (type: BoardObjectKind) => {
      if (!canEdit) {
        return;
      }

      const collectionRef = collection(db, "boards", boardId, "objects");
      const nextColor = getDefaultObjectColor(type);
      try {
        await addDoc(collectionRef, {
          type,
          zIndex: Date.now(),
          x: 40 / viewport.scale,
          y: 160 / viewport.scale,
          width: type === "line" ? 160 : undefined,
          height: 60,
          rotationDeg: 0,
          color: nextColor,
          text: type === "sticky" ? "New sticky note" : type === "text" ? "" : "",
          containerId: null,
          containerSectionIndex: null,
          fromObjectId: null,
          toObjectId: null,
          fromAnchor: null,
          toAnchor: null,
          gridRows: null,
          gridCols: null,
          gridGap: null,
          gridCellColors: null,
          containerTitle: null,
          gridSectionTitles: null,
          gridSectionNotes: null,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        } as Record<string, unknown>);
      } catch {
        setLoadingError("Failed to create object.");
      }
    },
    [boardId, canEdit, db, viewport.scale],
  );

  const handleCanvasPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!canEdit) {
        if (event.button !== 0) {
          return;
        }
        setSelectedObjectId(null);
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const worldPoint = projectPointer(event.clientX, event.clientY);
      const hit = getObjectHitTarget(objectsRef.current, worldPoint);
      const mode: DragMode = hit.type === "object" ? "move" : "pan";
      const nextMode = canEdit ? mode : "pan";

      const pointerId = event.pointerId;
      const targetObject = hit.objectId
        ? boardObjectById.get(hit.objectId) ?? null
        : null;

      dragStateRef.current = {
        mode: nextMode,
        objectId: hit.type === "object" ? hit.objectId : null,
        pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startBoardX: worldPoint.x,
        startBoardY: worldPoint.y,
        startViewportX: viewport.x,
        startViewportY: viewport.y,
        initialObjectX: targetObject?.x ?? 0,
        initialObjectY: targetObject?.y ?? 0,
      };

      setSelectedObjectId(hit.type === "object" ? hit.objectId : null);
      (event.currentTarget as HTMLDivElement).setPointerCapture(pointerId);
      event.preventDefault();
    },
    [boardObjectById, canEdit, projectPointer, viewport],
  );

  const commitObjectMove = useCallback(
    async (objectId: string, nextX: number, nextY: number) => {
      if (!canEdit) {
        return;
      }

      try {
        await updateDoc(doc(db, "boards", boardId, "objects", objectId), {
          x: roundCanvasPoint(nextX),
          y: roundCanvasPoint(nextY),
          updatedAt: serverTimestamp(),
        });
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
        const next: Viewport = {
          x: dragState.startViewportX + (event.clientX - dragState.startClientX),
          y: dragState.startViewportY + (event.clientY - dragState.startClientY),
          scale: viewport.scale,
        };
        setViewport(clampViewport(next));
        return;
      }

      if (dragState.mode !== "move" || !dragState.objectId) {
        return;
      }

      const deltaX = worldPoint.x - dragState.startBoardX;
      const deltaY = worldPoint.y - dragState.startBoardY;
      const nextObjects = objectsRef.current.map((objectItem) =>
        objectItem.id === dragState.objectId
          ? {
              ...objectItem,
              x: dragState.initialObjectX + deltaX,
              y: dragState.initialObjectY + deltaY,
            }
          : objectItem,
      );
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
      (event.currentTarget as HTMLDivElement).releasePointerCapture(event.pointerId);

      if (
        dragState.mode === "move" &&
        dragState.objectId &&
        canEdit
      ) {
        const target = boardObjectById.get(dragState.objectId) ?? null;
        if (target) {
          void commitObjectMove(
            target.id,
            target.x,
            target.y,
          );
        }
      }
    },
    [boardObjectById, canEdit, commitObjectMove],
  );

  const handleCanvasWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      adjustZoom(event.clientX, event.clientY, event.deltaY);
    },
    [adjustZoom],
  );

  return (
    <main
      ref={containerRef}
      style={{
        position: "relative",
        flex: 1,
        display: "flex",
        minHeight: 0,
        width: "100%",
        height: "100%",
        border: "1px solid var(--border)",
        overflow: "hidden",
        background: resolvedTheme === "dark" ? "#020617" : "#eef2ff",
        touchAction: "none",
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={handleCanvasPointerUp}
      onPointerCancel={handleCanvasPointerUp}
      onWheel={handleCanvasWheel}
      tabIndex={-1}
      aria-label="Board canvas"
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          background: resolvedTheme === "dark" ? "#0f172a" : "#f8fafc",
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
          gap: "0.5rem",
          alignItems: "center",
          pointerEvents: "auto",
        }}
      >
        <button
          type="button"
          onClick={() => {
            void createObjectAt("sticky");
          }}
          style={CANVAS_ACTION_BUTTON_STYLE}
          title="Create sticky"
        >
          + S
        </button>
        <button
          type="button"
          onClick={() => {
            void createObjectAt("rect");
          }}
          style={CANVAS_ACTION_BUTTON_STYLE}
          title="Create rectangle"
        >
          + R
        </button>
          <span
          style={{
            marginLeft: "auto",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.4rem 0.65rem",
            fontSize: 11,
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          Canvas mode active · scale {toCanvasPointString({ x: viewport.scale, y: viewport.scale })}
          {" "}
          · {objects.length} objects
        </span>
      </div>

      {loadingError ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            top: 56,
            borderRadius: 8,
            padding: "0.5rem 0.75rem",
            background: "#fef3c7",
            color: "#78350f",
            border: "1px solid #f59e0b",
            zIndex: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {loadingError}
        </div>
      ) : null}

      {!canEdit ? (
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            zIndex: 3,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.4rem 0.65rem",
            fontSize: 11,
            color: "var(--text-muted)",
          }}
        >
          Read-only mode.
        </div>
      ) : null}
    </main>
  );
}
