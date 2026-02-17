"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import type { User } from "firebase/auth";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";

import type {
  BoardObject,
  BoardObjectKind,
  BoardPermissions,
  PresenceUser
} from "@/features/boards/types";
import { getFirebaseClientDb } from "@/lib/firebase/client";

const CURSOR_THROTTLE_MS = 100;
const DRAG_THROTTLE_MS = 60;
const PRESENCE_HEARTBEAT_MS = 10_000;
const PRESENCE_TTL_MS = 15_000;

type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

type ViewportState = {
  x: number;
  y: number;
  scale: number;
};

type PanState = {
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
};

type DragState = {
  objectId: string;
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
  lastSentAt: number;
};

type ToolPanelPosition = {
  x: number;
  y: number;
};

type ToolPanelDragState = {
  startClientX: number;
  startClientY: number;
  initialX: number;
  initialY: number;
  isDragging: boolean;
};

type BoardPoint = {
  x: number;
  y: number;
};

type ResizeCorner = "nw" | "ne" | "sw" | "se";
type LineEndpoint = "start" | "end";

type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

type CornerResizeState = {
  objectId: string;
  objectType: Exclude<BoardObjectKind, "line">;
  corner: ResizeCorner;
  startClientX: number;
  startClientY: number;
  initialGeometry: ObjectGeometry;
  lastSentAt: number;
};

type LineEndpointResizeState = {
  objectId: string;
  endpoint: LineEndpoint;
  fixedPoint: BoardPoint;
  handleHeight: number;
  lastSentAt: number;
};

const BOARD_TOOLS: BoardObjectKind[] = ["sticky", "rect", "circle", "line"];
const TOOL_PANEL_EDGE_PADDING = 8;
const TOOL_PANEL_DRAG_THRESHOLD_PX = 5;
const INITIAL_TOOL_PANEL_POSITION: ToolPanelPosition = {
  x: 12,
  y: 12
};
const RESIZE_THROTTLE_MS = 60;
const RESIZE_HANDLE_SIZE = 10;
const LINE_MIN_LENGTH = 40;

const INITIAL_VIEWPORT: ViewportState = {
  x: 120,
  y: 80,
  scale: 1
};

function clampScale(nextScale: number): number {
  return Math.min(2.5, Math.max(0.3, nextScale));
}

function getString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function getNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  return null;
}

function getNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getTimestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return null;
}

function getFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getTimestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }

  return null;
}

function hashToColor(input: string): string {
  const palette = [
    "#2563eb",
    "#0ea5e9",
    "#0891b2",
    "#16a34a",
    "#f59e0b",
    "#dc2626",
    "#7c3aed",
    "#db2777"
  ];

  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }

  return palette[Math.abs(hash) % palette.length];
}

function isBoardObjectKind(value: unknown): value is BoardObjectKind {
  return value === "sticky" || value === "rect" || value === "circle" || value === "line";
}

function getDefaultObjectSize(kind: BoardObjectKind): { width: number; height: number } {
  if (kind === "sticky") {
    return { width: 220, height: 170 };
  }

  if (kind === "rect") {
    return { width: 240, height: 150 };
  }

  if (kind === "circle") {
    return { width: 170, height: 170 };
  }

  return { width: 240, height: 64 };
}

function getMinimumObjectSize(kind: BoardObjectKind): { width: number; height: number } {
  if (kind === "sticky") {
    return { width: 140, height: 100 };
  }

  if (kind === "rect") {
    return { width: 80, height: 60 };
  }

  if (kind === "circle") {
    return { width: 80, height: 80 };
  }

  return { width: LINE_MIN_LENGTH, height: 32 };
}

function getDefaultObjectColor(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "#fde68a";
  }

  if (kind === "rect") {
    return "#93c5fd";
  }

  if (kind === "circle") {
    return "#86efac";
  }

  return "#1f2937";
}

function getObjectLabel(kind: BoardObjectKind): string {
  if (kind === "sticky") {
    return "Sticky";
  }

  if (kind === "rect") {
    return "Rectangle";
  }

  if (kind === "circle") {
    return "Circle";
  }

  return "Line";
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function getLineEndpoints(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.x + geometry.width / 2;
  const centerY = geometry.y + geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength
    }
  };
}

function getLineEndpointOffsets(geometry: ObjectGeometry): {
  start: BoardPoint;
  end: BoardPoint;
} {
  const centerX = geometry.width / 2;
  const centerY = geometry.height / 2;
  const halfLength = geometry.width / 2;
  const radians = toRadians(geometry.rotationDeg);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  return {
    start: {
      x: centerX - cos * halfLength,
      y: centerY - sin * halfLength
    },
    end: {
      x: centerX + cos * halfLength,
      y: centerY + sin * halfLength
    }
  };
}

function ToolIcon({ kind }: { kind: BoardObjectKind }) {
  if (kind === "sticky") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="2" width="12" height="12" rx="1.5" fill="#fde68a" stroke="#d4b84f" />
      </svg>
    );
  }

  if (kind === "rect") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="0.5" fill="#93c5fd" stroke="#1d4ed8" />
      </svg>
    );
  }

  if (kind === "circle") {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="5.5" fill="#86efac" stroke="#15803d" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2.5" y1="8" x2="13.5" y2="8" stroke="#1f2937" strokeWidth="2.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3.5 4.5h9m-7.8 0 .4 8.2a1 1 0 0 0 1 .9h3a1 1 0 0 0 1-.9l.4-8.2m-4.9 0V3.2a.7.7 0 0 1 .7-.7h2.6a.7.7 0 0 1 .7.7v1.3"
        stroke="#7f1d1d"
        strokeWidth="1.35"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const CORNER_HANDLES: ResizeCorner[] = ["nw", "ne", "sw", "se"];

function getCornerCursor(corner: ResizeCorner): string {
  return corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
}

function getCornerPositionStyle(corner: ResizeCorner): {
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  transform: string;
} {
  if (corner === "nw") {
    return { left: 0, top: 0, transform: "translate(-50%, -50%)" };
  }

  if (corner === "ne") {
    return { right: 0, top: 0, transform: "translate(50%, -50%)" };
  }

  if (corner === "sw") {
    return { left: 0, bottom: 0, transform: "translate(-50%, 50%)" };
  }

  return { right: 0, bottom: 0, transform: "translate(50%, 50%)" };
}

function toBoardObject(rawId: string, rawData: Record<string, unknown>): BoardObject | null {
  const type = rawData.type;
  if (!isBoardObjectKind(type)) {
    return null;
  }

  const defaults = getDefaultObjectSize(type);

  return {
    id: rawId,
    type,
    x: getNumber(rawData.x, 0),
    y: getNumber(rawData.y, 0),
    width: getNumber(rawData.width, defaults.width),
    height: getNumber(rawData.height, defaults.height),
    rotationDeg: getNumber(rawData.rotationDeg, 0),
    color: getString(rawData.color, getDefaultObjectColor(type)),
    text: getString(rawData.text, type === "sticky" ? "New sticky note" : ""),
    updatedAt: getTimestampIso(rawData.updatedAt)
  };
}

function toPresenceUser(rawId: string, rawData: Record<string, unknown>): PresenceUser {
  const lastSeenAtMs = getFiniteNumber(rawData.lastSeenAtMs);
  const lastSeenAt = lastSeenAtMs ?? getTimestampMillis(rawData.lastSeenAt);

  return {
    uid: rawId,
    displayName: getNullableString(rawData.displayName),
    email: getNullableString(rawData.email),
    color: getString(rawData.color, hashToColor(rawId)),
    cursorX: typeof rawData.cursorX === "number" ? rawData.cursorX : null,
    cursorY: typeof rawData.cursorY === "number" ? rawData.cursorY : null,
    active: Boolean(rawData.active),
    lastSeenAt
  };
}

function getPresenceLabel(user: PresenceUser): string {
  return user.displayName ?? user.email ?? user.uid;
}

function toBoardErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
    };

    const code = typeof candidate.code === "string" ? candidate.code : null;
    const message = typeof candidate.message === "string" ? candidate.message : null;

    if (code === "permission-denied") {
      return `${fallback} Firestore denied the request (permission-denied).`;
    }

    if (code && message) {
      return `${fallback} (${code}: ${message})`;
    }

    if (code) {
      return `${fallback} (${code})`;
    }

    if (message) {
      return `${fallback} (${message})`;
    }
  }

  if (typeof error === "string" && error.length > 0) {
    return `${fallback} (${error})`;
  }

  return fallback;
}

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions
}: RealtimeBoardCanvasProps) {
  const db = useMemo(() => getFirebaseClientDb(), []);
  const canEdit = permissions.canEdit;

  const stageRef = useRef<HTMLDivElement | null>(null);
  const toolPanelRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportState>(INITIAL_VIEWPORT);
  const panStateRef = useRef<PanState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const cornerResizeStateRef = useRef<CornerResizeState | null>(null);
  const lineEndpointResizeStateRef = useRef<LineEndpointResizeState | null>(null);
  const toolPanelDragStateRef = useRef<ToolPanelDragState | null>(null);
  const suppressToolPanelClickRef = useRef(false);
  const toolPanelPositionRef = useRef<ToolPanelPosition>(INITIAL_TOOL_PANEL_POSITION);
  const idTokenRef = useRef<string | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());
  const selectedObjectIdRef = useRef<string | null>(null);
  const draftGeometryByIdRef = useRef<Record<string, ObjectGeometry>>({});
  const sendCursorAtRef = useRef(0);
  const canEditRef = useRef(canEdit);

  const [viewport, setViewport] = useState<ViewportState>(INITIAL_VIEWPORT);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);
  const [textDrafts, setTextDrafts] = useState<Record<string, string>>({});
  const [draftGeometryById, setDraftGeometryById] = useState<Record<string, ObjectGeometry>>(
    {}
  );
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [presenceClock, setPresenceClock] = useState(() => Date.now());
  const [toolPanelPosition, setToolPanelPosition] = useState<ToolPanelPosition>(
    INITIAL_TOOL_PANEL_POSITION
  );

  const boardColor = useMemo(() => hashToColor(user.uid), [user.uid]);
  const objectsCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/objects`),
    [boardId, db]
  );
  const presenceCollectionRef = useMemo(
    () => collection(db, `boards/${boardId}/presence`),
    [boardId, db]
  );
  const selfPresenceRef = useMemo(
    () => doc(db, `boards/${boardId}/presence/${user.uid}`),
    [boardId, db, user.uid]
  );

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  useEffect(() => {
    objectsByIdRef.current = new Map(objects.map((item) => [item.id, item]));
  }, [objects]);

  useEffect(() => {
    draftGeometryByIdRef.current = draftGeometryById;
  }, [draftGeometryById]);

  useEffect(() => {
    toolPanelPositionRef.current = toolPanelPosition;
  }, [toolPanelPosition]);

  useEffect(() => {
    selectedObjectIdRef.current = selectedObjectId;
  }, [selectedObjectId]);

  useEffect(() => {
    let cancelled = false;

    const refreshIdToken = async () => {
      try {
        const token = await user.getIdToken();
        if (!cancelled) {
          idTokenRef.current = token;
        }
      } catch {
        if (!cancelled) {
          idTokenRef.current = null;
        }
      }
    };

    void refreshIdToken();
    const refreshInterval = window.setInterval(() => {
      void refreshIdToken();
    }, 10 * 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(refreshInterval);
    };
  }, [user]);

  const pushPresencePatchToApi = useCallback(
    (payload: { active: boolean; cursorX: number | null; cursorY: number | null }, keepalive: boolean) => {
      const idToken = idTokenRef.current;
      if (!idToken) {
        return;
      }

      void fetch(`/api/boards/${boardId}/presence`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        keepalive
      }).catch(() => {
        // Best-effort fallback for tab close/navigation transitions.
      });
    },
    [boardId]
  );

  const markPresenceInactive = useCallback(
    (keepalive: boolean) => {
      const payload = {
        active: false,
        cursorX: null,
        cursorY: null
      };

      void setDoc(
        selfPresenceRef,
        {
          ...payload,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp()
        },
        { merge: true }
      ).catch(() => {
        // Ignore write failures during navigation/tab close.
      });

      pushPresencePatchToApi(payload, keepalive);
    },
    [pushPresencePatchToApi, selfPresenceRef]
  );

  useEffect(() => {
    const unsubscribe = onSnapshot(
      objectsCollectionRef,
      (snapshot) => {
        const nextObjects: BoardObject[] = [];
        snapshot.docs.forEach((documentSnapshot) => {
          const parsed = toBoardObject(
            documentSnapshot.id,
            documentSnapshot.data() as Record<string, unknown>
          );
          if (parsed) {
            nextObjects.push(parsed);
          }
        });

        nextObjects.sort((left, right) => {
          const leftValue = left.updatedAt ? Date.parse(left.updatedAt) : 0;
          const rightValue = right.updatedAt ? Date.parse(right.updatedAt) : 0;
          return leftValue - rightValue;
        });

        const selectedId = selectedObjectIdRef.current;
        if (
          selectedId &&
          !nextObjects.some((objectItem) => objectItem.id === selectedId)
        ) {
          setSelectedObjectId(null);
        }

        setObjects(nextObjects);
      },
      (error) => {
        console.error("Failed to sync board objects", error);
        setBoardError(toBoardErrorMessage(error, "Failed to sync board objects."));
      }
    );

    return unsubscribe;
  }, [objectsCollectionRef]);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      presenceCollectionRef,
      (snapshot) => {
        const users = snapshot.docs.map((documentSnapshot) =>
          toPresenceUser(
            documentSnapshot.id,
            documentSnapshot.data({
              serverTimestamps: "estimate"
            }) as Record<string, unknown>
          )
        );
        setPresenceUsers(users);
      },
      (error) => {
        console.error("Failed to sync presence", error);
      }
    );

    return unsubscribe;
  }, [presenceCollectionRef]);

  useEffect(() => {
    const setPresenceState = async (cursor: BoardPoint | null, active: boolean) => {
      await setDoc(
        selfPresenceRef,
        {
          uid: user.uid,
          displayName: user.displayName ?? null,
          email: user.email ?? null,
          color: boardColor,
          cursorX: cursor?.x ?? null,
          cursorY: cursor?.y ?? null,
          active,
          lastSeenAtMs: Date.now(),
          lastSeenAt: serverTimestamp()
        },
        { merge: true }
      );
    };

    void setPresenceState(null, true);

    const heartbeatInterval = window.setInterval(() => {
      void setPresenceState(null, true);
    }, PRESENCE_HEARTBEAT_MS);

    const presenceTicker = window.setInterval(() => {
      setPresenceClock(Date.now());
    }, 5_000);

    return () => {
      window.clearInterval(heartbeatInterval);
      window.clearInterval(presenceTicker);
      markPresenceInactive(false);
    };
  }, [boardColor, markPresenceInactive, selfPresenceRef, user.displayName, user.email, user.uid]);

  useEffect(() => {
    const handlePageHide = () => {
      markPresenceInactive(true);
    };

    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("beforeunload", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("beforeunload", handlePageHide);
    };
  }, [markPresenceInactive]);

  const getCurrentObjectGeometry = useCallback((objectId: string): ObjectGeometry | null => {
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
      rotationDeg: objectItem.rotationDeg
    };
  }, []);

  const setDraftGeometry = useCallback((objectId: string, geometry: ObjectGeometry) => {
    setDraftGeometryById((previous) => ({
      ...previous,
      [objectId]: geometry
    }));
  }, []);

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

  const updateObjectGeometry = useCallback(
    async (objectId: string, geometry: ObjectGeometry) => {
      if (!canEditRef.current) {
        return;
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          x: geometry.x,
          y: geometry.y,
          width: geometry.width,
          height: geometry.height,
          rotationDeg: geometry.rotationDeg,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to update object transform", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update object transform."));
      }
    },
    [boardId, db]
  );

  const updateObjectPosition = useCallback(
    async (objectId: string, nextX: number, nextY: number) => {
      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      await updateObjectGeometry(objectId, {
        ...geometry,
        x: nextX,
        y: nextY
      });
    },
    [getCurrentObjectGeometry, updateObjectGeometry]
  );

  const clampToolPanelPosition = useCallback((nextPosition: ToolPanelPosition) => {
    const stageElement = stageRef.current;
    const panelElement = toolPanelRef.current;
    if (!stageElement || !panelElement) {
      return nextPosition;
    }

    const stageRect = stageElement.getBoundingClientRect();
    const panelRect = panelElement.getBoundingClientRect();

    const maxX = Math.max(
      TOOL_PANEL_EDGE_PADDING,
      stageRect.width - panelRect.width - TOOL_PANEL_EDGE_PADDING
    );
    const maxY = Math.max(
      TOOL_PANEL_EDGE_PADDING,
      stageRect.height - panelRect.height - TOOL_PANEL_EDGE_PADDING
    );

    return {
      x: Math.min(maxX, Math.max(TOOL_PANEL_EDGE_PADDING, nextPosition.x)),
      y: Math.min(maxY, Math.max(TOOL_PANEL_EDGE_PADDING, nextPosition.y))
    };
  }, []);

  const getResizedGeometry = useCallback(
    (
      state: CornerResizeState,
      clientX: number,
      clientY: number,
      scale: number
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
        const size = Math.max(minimumSize.width, Math.max(nextWidth, nextHeight));
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

      return {
        x: nextX,
        y: nextY,
        width: nextWidth,
        height: nextHeight,
        rotationDeg: state.initialGeometry.rotationDeg
      };
    },
    []
  );

  const getLineGeometryFromEndpointDrag = useCallback(
    (state: LineEndpointResizeState, movingPoint: BoardPoint): ObjectGeometry => {
      const dx = movingPoint.x - state.fixedPoint.x;
      const dy = movingPoint.y - state.fixedPoint.y;
      const distance = Math.hypot(dx, dy);
      const length = Math.max(LINE_MIN_LENGTH, distance);
      const angle = distance < 0.001 ? 0 : toDegrees(Math.atan2(dy, dx));

      const normalizedX = distance < 0.001 ? 1 : dx / distance;
      const normalizedY = distance < 0.001 ? 0 : dy / distance;
      const adjustedMovingPoint = {
        x: state.fixedPoint.x + normalizedX * length,
        y: state.fixedPoint.y + normalizedY * length
      };

      const startPoint =
        state.endpoint === "start" ? adjustedMovingPoint : state.fixedPoint;
      const endPoint = state.endpoint === "end" ? adjustedMovingPoint : state.fixedPoint;
      const centerX = (startPoint.x + endPoint.x) / 2;
      const centerY = (startPoint.y + endPoint.y) / 2;

      return {
        x: centerX - length / 2,
        y: centerY - state.handleHeight / 2,
        width: length,
        height: state.handleHeight,
        rotationDeg: angle
      };
    },
    []
  );

  useEffect(() => {
    const handleWindowPointerMove = (event: PointerEvent) => {
      const panelDragState = toolPanelDragStateRef.current;
      if (panelDragState) {
        const deltaX = event.clientX - panelDragState.startClientX;
        const deltaY = event.clientY - panelDragState.startClientY;
        if (!panelDragState.isDragging) {
          const distance = Math.hypot(deltaX, deltaY);
          if (distance < TOOL_PANEL_DRAG_THRESHOLD_PX) {
            return;
          }
          panelDragState.isDragging = true;
          suppressToolPanelClickRef.current = true;
        }

        const rawX =
          panelDragState.initialX + deltaX;
        const rawY =
          panelDragState.initialY + deltaY;
        setToolPanelPosition(clampToolPanelPosition({ x: rawX, y: rawY }));
        return;
      }

      const scale = viewportRef.current.scale;
      const cornerResizeState = cornerResizeStateRef.current;
      if (cornerResizeState) {
        const nextGeometry = getResizedGeometry(
          cornerResizeState,
          event.clientX,
          event.clientY,
          scale
        );

        setDraftGeometry(cornerResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (canEditRef.current && now - cornerResizeState.lastSentAt >= RESIZE_THROTTLE_MS) {
          cornerResizeState.lastSentAt = now;
          void updateObjectGeometry(cornerResizeState.objectId, nextGeometry);
        }
        return;
      }

      const lineEndpointResizeState = lineEndpointResizeStateRef.current;
      if (lineEndpointResizeState) {
        const stageElement = stageRef.current;
        if (!stageElement) {
          return;
        }

        const rect = stageElement.getBoundingClientRect();
        const movingPoint = {
          x: (event.clientX - rect.left - viewportRef.current.x) / scale,
          y: (event.clientY - rect.top - viewportRef.current.y) / scale
        };

        const nextGeometry = getLineGeometryFromEndpointDrag(
          lineEndpointResizeState,
          movingPoint
        );

        setDraftGeometry(lineEndpointResizeState.objectId, nextGeometry);

        const now = Date.now();
        if (
          canEditRef.current &&
          now - lineEndpointResizeState.lastSentAt >= RESIZE_THROTTLE_MS
        ) {
          lineEndpointResizeState.lastSentAt = now;
          void updateObjectGeometry(lineEndpointResizeState.objectId, nextGeometry);
        }
        return;
      }

      const panState = panStateRef.current;
      if (panState) {
        const nextX = panState.initialX + (event.clientX - panState.startClientX);
        const nextY = panState.initialY + (event.clientY - panState.startClientY);
        setViewport((previous) => ({
          x: nextX,
          y: nextY,
          scale: previous.scale
        }));
      }

      const dragState = dragStateRef.current;
      if (dragState) {
        const nextX =
          dragState.initialX + (event.clientX - dragState.startClientX) / scale;
        const nextY =
          dragState.initialY + (event.clientY - dragState.startClientY) / scale;

        const currentGeometry = getCurrentObjectGeometry(dragState.objectId);
        if (!currentGeometry) {
          return;
        }

        setDraftGeometry(dragState.objectId, {
          ...currentGeometry,
          x: nextX,
          y: nextY
        });

        const now = Date.now();
        if (canEditRef.current && now - dragState.lastSentAt >= DRAG_THROTTLE_MS) {
          dragState.lastSentAt = now;
          void updateObjectPosition(dragState.objectId, nextX, nextY);
        }
      }
    };

    const handleWindowPointerUp = (event: PointerEvent) => {
      const panelDragState = toolPanelDragStateRef.current;
      if (panelDragState) {
        toolPanelDragStateRef.current = null;
        if (panelDragState.isDragging) {
          window.setTimeout(() => {
            suppressToolPanelClickRef.current = false;
          }, 250);
        }
        return;
      }

      const cornerResizeState = cornerResizeStateRef.current;
      if (cornerResizeState) {
        cornerResizeStateRef.current = null;
        const finalGeometry = draftGeometryByIdRef.current[cornerResizeState.objectId];
        clearDraftGeometry(cornerResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(cornerResizeState.objectId, finalGeometry);
        }
        return;
      }

      const lineEndpointResizeState = lineEndpointResizeStateRef.current;
      if (lineEndpointResizeState) {
        lineEndpointResizeStateRef.current = null;
        const finalGeometry = draftGeometryByIdRef.current[lineEndpointResizeState.objectId];
        clearDraftGeometry(lineEndpointResizeState.objectId);

        if (finalGeometry && canEditRef.current) {
          void updateObjectGeometry(lineEndpointResizeState.objectId, finalGeometry);
        }
        return;
      }

      if (panStateRef.current) {
        panStateRef.current = null;
      }

      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      const scale = viewportRef.current.scale;
      const finalX = dragState.initialX + (event.clientX - dragState.startClientX) / scale;
      const finalY = dragState.initialY + (event.clientY - dragState.startClientY) / scale;

      dragStateRef.current = null;
      clearDraftGeometry(dragState.objectId);

      if (canEditRef.current) {
        void updateObjectPosition(dragState.objectId, finalX, finalY);
      }
    };

    window.addEventListener("pointermove", handleWindowPointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handleWindowPointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
    };
  }, [
    clampToolPanelPosition,
    clearDraftGeometry,
    getCurrentObjectGeometry,
    getLineGeometryFromEndpointDrag,
    getResizedGeometry,
    setDraftGeometry,
    updateObjectGeometry,
    updateObjectPosition
  ]);

  const toBoardCoordinates = useCallback(
    (clientX: number, clientY: number): BoardPoint | null => {
      const stageElement = stageRef.current;
      if (!stageElement) {
        return null;
      }

      const rect = stageElement.getBoundingClientRect();
      const x = (clientX - rect.left - viewportRef.current.x) / viewportRef.current.scale;
      const y = (clientY - rect.top - viewportRef.current.y) / viewportRef.current.scale;

      return { x, y };
    },
    []
  );

  const updateCursor = useCallback(
    async (cursor: BoardPoint | null) => {
      try {
        await setDoc(
          selfPresenceRef,
          {
            cursorX: cursor?.x ?? null,
            cursorY: cursor?.y ?? null,
            active: true,
            lastSeenAtMs: Date.now(),
            lastSeenAt: serverTimestamp()
          },
          { merge: true }
        );
      } catch {
        // Ignore cursor write failures to avoid interrupting interactions.
      }
    },
    [selfPresenceRef]
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
      const centerX = (rect.width / 2 - viewportRef.current.x) / viewportRef.current.scale;
      const centerY = (rect.height / 2 - viewportRef.current.y) / viewportRef.current.scale;
      const { width, height } = getDefaultObjectSize(kind);

      try {
        await addDoc(objectsCollectionRef, {
          type: kind,
          x: centerX - width / 2,
          y: centerY - height / 2,
          width,
          height,
          rotationDeg: 0,
          color: getDefaultObjectColor(kind),
          text: kind === "sticky" ? "New sticky note" : "",
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to create object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to create object."));
      }
    },
    [canEdit, objectsCollectionRef, user.uid]
  );

  const deleteObject = useCallback(
    async (objectId: string) => {
      if (!canEdit) {
        return;
      }

      try {
        await deleteDoc(doc(db, `boards/${boardId}/objects/${objectId}`));
        setSelectedObjectId((previous) => (previous === objectId ? null : previous));
      } catch (error) {
        console.error("Failed to delete object", error);
        setBoardError(toBoardErrorMessage(error, "Failed to delete object."));
      }
    },
    [boardId, canEdit, db]
  );

  const saveStickyText = useCallback(
    async (objectId: string, nextText: string) => {
      if (!canEdit) {
        return;
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          text: nextText.slice(0, 1_000),
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to update sticky text", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update sticky text."));
      }
    },
    [boardId, canEdit, db]
  );

  const saveObjectColor = useCallback(
    async (objectId: string, color: string) => {
      if (!canEdit) {
        return;
      }

      try {
        await updateDoc(doc(db, `boards/${boardId}/objects/${objectId}`), {
          color,
          updatedAt: serverTimestamp()
        });
      } catch (error) {
        console.error("Failed to update object color", error);
        setBoardError(toBoardErrorMessage(error, "Failed to update object color."));
      }
    },
    [boardId, canEdit, db]
  );

  const handleDeleteSelectedObject = useCallback(() => {
    if (!canEdit || !selectedObjectId) {
      return;
    }

    void deleteObject(selectedObjectId);
  }, [canEdit, deleteObject, selectedObjectId]);

  const consumeSuppressedToolPanelClick = useCallback((): boolean => {
    if (!suppressToolPanelClickRef.current) {
      return false;
    }

    suppressToolPanelClickRef.current = false;
    return true;
  }, []);

  const handleToolPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }

      toolPanelDragStateRef.current = {
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialX: toolPanelPositionRef.current.x,
        initialY: toolPanelPositionRef.current.y,
        isDragging: false
      };
    },
    []
  );

  const handleToolButtonClick = useCallback(
    (toolKind: BoardObjectKind) => {
      if (consumeSuppressedToolPanelClick()) {
        return;
      }

      void createObject(toolKind);
    },
    [consumeSuppressedToolPanelClick, createObject]
  );

  const handleDeleteButtonClick = useCallback(() => {
    if (consumeSuppressedToolPanelClick()) {
      return;
    }

    handleDeleteSelectedObject();
  }, [consumeSuppressedToolPanelClick, handleDeleteSelectedObject]);

  const handleStagePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("[data-tool-panel='true']")) {
      return;
    }

    if (target.closest("[data-board-object='true']")) {
      return;
    }

    setSelectedObjectId(null);

    panStateRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      initialX: viewportRef.current.x,
      initialY: viewportRef.current.y
    };
  }, []);

  const handleStagePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const now = Date.now();
      if (now - sendCursorAtRef.current < CURSOR_THROTTLE_MS) {
        return;
      }

      sendCursorAtRef.current = now;
      const nextPoint = toBoardCoordinates(event.clientX, event.clientY);
      if (!nextPoint) {
        return;
      }

      void updateCursor(nextPoint);
    },
    [toBoardCoordinates, updateCursor]
  );

  const handleStagePointerLeave = useCallback(() => {
    void updateCursor(null);
  }, [updateCursor]);

  const zoomAtPointer = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const rect = stageElement.getBoundingClientRect();
    const pointerX = clientX - rect.left;
    const pointerY = clientY - rect.top;

    const current = viewportRef.current;
    const worldX = (pointerX - current.x) / current.scale;
    const worldY = (pointerY - current.y) / current.scale;

    const zoomFactor = Math.exp(-deltaY * 0.0012);
    const nextScale = clampScale(current.scale * zoomFactor);

    const nextX = pointerX - worldX * nextScale;
    const nextY = pointerY - worldY * nextScale;

    setViewport({
      x: nextX,
      y: nextY,
      scale: nextScale
    });
  }, []);

  const panByWheel = useCallback((deltaX: number, deltaY: number) => {
    setViewport((previous) => ({
      x: previous.x - deltaX,
      y: previous.y - deltaY,
      scale: previous.scale
    }));
  }, []);

  useEffect(() => {
    const stageElement = stageRef.current;
    if (!stageElement) {
      return;
    }

    const handleNativeWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.ctrlKey || event.metaKey) {
        zoomAtPointer(event.clientX, event.clientY, event.deltaY);
        return;
      }

      panByWheel(event.deltaX, event.deltaY);
    };

    stageElement.addEventListener("wheel", handleNativeWheel, { passive: false });

    return () => {
      stageElement.removeEventListener("wheel", handleNativeWheel);
    };
  }, [panByWheel, zoomAtPointer]);

  const startObjectDrag = useCallback(
    (objectId: string, event: ReactPointerEvent<HTMLElement>) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setSelectedObjectId(objectId);

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      dragStateRef.current = {
        objectId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialX: geometry.x,
        initialY: geometry.y,
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry]
  );

  const startCornerResize = useCallback(
    (objectId: string, corner: ResizeCorner, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type === "line") {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      setSelectedObjectId(objectId);
      cornerResizeStateRef.current = {
        objectId,
        objectType: objectItem.type,
        corner,
        startClientX: event.clientX,
        startClientY: event.clientY,
        initialGeometry: geometry,
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry]
  );

  const startLineEndpointResize = useCallback(
    (
      objectId: string,
      endpoint: LineEndpoint,
      event: ReactPointerEvent<HTMLButtonElement>
    ) => {
      if (!canEdit) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const objectItem = objectsByIdRef.current.get(objectId);
      if (!objectItem || objectItem.type !== "line") {
        return;
      }

      const geometry = getCurrentObjectGeometry(objectId);
      if (!geometry) {
        return;
      }

      const endpoints = getLineEndpoints(geometry);
      const fixedPoint = endpoint === "start" ? endpoints.end : endpoints.start;

      setSelectedObjectId(objectId);
      lineEndpointResizeStateRef.current = {
        objectId,
        endpoint,
        fixedPoint,
        handleHeight: geometry.height,
        lastSentAt: 0
      };
    },
    [canEdit, getCurrentObjectGeometry]
  );

  const onlineUsers = useMemo(
    () =>
      presenceUsers
        .filter((presenceUser) => {
          if (!presenceUser.active) {
            return false;
          }

          if (!presenceUser.lastSeenAt) {
            return false;
          }

          return presenceClock - presenceUser.lastSeenAt <= PRESENCE_TTL_MS;
        })
        .sort((left, right) => getPresenceLabel(left).localeCompare(getPresenceLabel(right))),
    [presenceClock, presenceUsers]
  );

  const remoteCursors = useMemo(
    () =>
      onlineUsers.filter(
        (presenceUser) =>
          presenceUser.uid !== user.uid &&
          presenceUser.cursorX !== null &&
          presenceUser.cursorY !== null
      ),
    [onlineUsers, user.uid]
  );
  const hasDeletableSelection = useMemo(
    () => canEdit && selectedObjectId !== null && objects.some((item) => item.id === selectedObjectId),
    [canEdit, objects, selectedObjectId]
  );

  const zoomPercent = Math.round(viewport.scale * 100);

  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: 10,
        padding: "1rem",
        marginBottom: "1rem"
      }}
    >
      <h2 style={{ marginTop: 0 }}>Realtime Board</h2>
      <p style={{ marginTop: 0, color: "#4b5563" }}>
        {canEdit
          ? "Create and move objects in real-time. Changes sync across users."
          : "Read-only mode. You can pan/zoom and see live updates, but edits are disabled."}
      </p>
      <p style={{ marginTop: "-0.25rem", color: "#6b7280", fontSize: 13 }}>
        Select an object to resize. Drag corner handles for notes/shapes. Drag line endpoints
        to change angle and length.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          alignItems: "center",
          marginBottom: "0.75rem"
        }}
      >
        <button
          type="button"
          onClick={() => setViewport(INITIAL_VIEWPORT)}
        >
          Reset view
        </button>
        <span style={{ color: "#6b7280" }}>Zoom: {zoomPercent}%</span>
        <span style={{ color: selectedObjectId ? "#111827" : "#6b7280" }}>
          Selected: {selectedObjectId ? "1 object" : "None"}
        </span>
        <span style={{ marginLeft: "auto", color: "#6b7280" }}>
          Online: {onlineUsers.length}
        </span>
      </div>

      <div
        style={{
          marginBottom: "0.75rem",
          fontSize: 14,
          color: "#4b5563",
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem"
        }}
      >
        {onlineUsers.length > 0 ? (
          onlineUsers.map((presenceUser) => (
            <span key={presenceUser.uid}>
              <span style={{ color: presenceUser.color }}>●</span>{" "}
              {getPresenceLabel(presenceUser)}
            </span>
          ))
        ) : (
          <span>No active users yet.</span>
        )}
      </div>

      {boardError ? <p style={{ color: "#b91c1c" }}>{boardError}</p> : null}

      <div
        ref={stageRef}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerLeave={handleStagePointerLeave}
        style={{
          position: "relative",
          height: "70vh",
          minHeight: 540,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          overflow: "hidden",
          backgroundColor: "#f9fafb",
          backgroundImage:
            "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
          backgroundSize: `${40 * viewport.scale}px ${40 * viewport.scale}px`,
          backgroundPosition: `${viewport.x}px ${viewport.y}px`,
          touchAction: "none",
          overscrollBehavior: "contain"
        }}
      >
        <div
          ref={toolPanelRef}
          data-tool-panel="true"
          onPointerDown={handleToolPanelPointerDown}
          style={{
            position: "absolute",
            left: toolPanelPosition.x,
            top: toolPanelPosition.y,
            zIndex: 30,
            border: "1px solid #d1d5db",
            borderRadius: 12,
            background: "rgba(255,255,255,0.94)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
            padding: "0.5rem",
            backdropFilter: "blur(4px)",
            minWidth: 208,
            cursor: "grab"
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              marginBottom: "0.4rem"
            }}
          >
            <strong style={{ fontSize: 12, color: "#374151" }}>Tools</strong>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "0.35rem",
              marginBottom: "0.4rem"
            }}
          >
            {BOARD_TOOLS.map((toolKind) => (
              <button
                key={toolKind}
                type="button"
                onClick={() => handleToolButtonClick(toolKind)}
                disabled={!canEdit}
                title={`Add ${getObjectLabel(toolKind).toLowerCase()}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  background: "white",
                  height: 32
                }}
              >
                <ToolIcon kind={toolKind} />
              </button>
            ))}
          </div>

          {hasDeletableSelection ? (
            <button
              type="button"
              onClick={handleDeleteButtonClick}
              title="Delete selected object"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
                border: "1px solid #fecaca",
                borderRadius: 8,
                background: "#fef2f2",
                color: "#7f1d1d",
                height: 32,
                fontSize: 12
              }}
            >
              <TrashIcon />
              <span>Delete selected</span>
            </button>
          ) : null}
        </div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})`,
            transformOrigin: "0 0"
          }}
        >
          {objects.map((objectItem) => {
            const draftGeometry = draftGeometryById[objectItem.id];
            const objectX = draftGeometry?.x ?? objectItem.x;
            const objectY = draftGeometry?.y ?? objectItem.y;
            const objectWidth = draftGeometry?.width ?? objectItem.width;
            const objectHeight = draftGeometry?.height ?? objectItem.height;
            const objectRotationDeg =
              draftGeometry?.rotationDeg ?? objectItem.rotationDeg;
            const objectText = textDrafts[objectItem.id] ?? objectItem.text;
            const isSelected = selectedObjectId === objectItem.id;
            const objectGeometry: ObjectGeometry = {
              x: objectX,
              y: objectY,
              width: objectWidth,
              height: objectHeight,
              rotationDeg: objectRotationDeg
            };
            const lineEndpointOffsets =
              objectItem.type === "line" ? getLineEndpointOffsets(objectGeometry) : null;

            if (objectItem.type === "sticky") {
              return (
                <article
                  key={objectItem.id}
                  data-board-object="true"
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    setSelectedObjectId(objectItem.id);
                  }}
                  style={{
                    position: "absolute",
                    left: objectX,
                    top: objectY,
                    width: objectWidth,
                    height: objectHeight,
                    borderRadius: 10,
                    border: isSelected ? "2px solid #b45309" : "1px solid #d4b84f",
                    background: objectItem.color,
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(245, 158, 11, 0.35), 0 8px 14px rgba(0,0,0,0.14)"
                      : "0 4px 12px rgba(0,0,0,0.08)",
                    overflow: "visible"
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 8,
                      overflow: "hidden"
                    }}
                  >
                    <header
                      onPointerDown={(event) => startObjectDrag(objectItem.id, event)}
                      style={{
                        height: 28,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-start",
                        gap: "0.35rem",
                        padding: "0 0.5rem",
                        background: "rgba(0,0,0,0.08)",
                        cursor: canEdit ? "grab" : "default"
                      }}
                    />

                    <textarea
                      value={objectText}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        setSelectedObjectId(objectItem.id);
                      }}
                      onFocus={() => setSelectedObjectId(objectItem.id)}
                      onChange={(event) =>
                        setTextDrafts((previous) => ({
                          ...previous,
                          [objectItem.id]: event.target.value
                        }))
                      }
                      onBlur={(event) => {
                        const nextText = event.target.value;
                        setTextDrafts((previous) => {
                          const next = { ...previous };
                          delete next[objectItem.id];
                          return next;
                        });

                        if (nextText !== objectItem.text) {
                          void saveStickyText(objectItem.id, nextText);
                        }
                      }}
                      readOnly={!canEdit}
                      style={{
                        width: "100%",
                        height: objectHeight - 28,
                        border: "none",
                        resize: "none",
                        padding: "0.5rem",
                        background: "transparent",
                        color: "#111827",
                        fontSize: 14,
                        outline: "none"
                      }}
                    />
                  </div>

                  {isSelected && canEdit ? (
                    <input
                      type="color"
                      value={objectItem.color}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => void saveObjectColor(objectItem.id, event.target.value)}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 6,
                        width: 24,
                        height: 24,
                        border: "1px solid #d1d5db",
                        borderRadius: 4,
                        background: "white",
                        padding: 0
                      }}
                      aria-label="Change sticky color"
                    />
                  ) : null}

                  {isSelected && canEdit ? (
                    <div>
                      {CORNER_HANDLES.map((corner) => (
                        <button
                          key={corner}
                          type="button"
                          onPointerDown={(event) =>
                            startCornerResize(objectItem.id, corner, event)
                          }
                          style={{
                            position: "absolute",
                            ...getCornerPositionStyle(corner),
                            width: RESIZE_HANDLE_SIZE,
                            height: RESIZE_HANDLE_SIZE,
                            border: "1px solid #1d4ed8",
                            borderRadius: 2,
                            background: "white",
                            cursor: getCornerCursor(corner)
                          }}
                          aria-label={`Resize ${corner} corner`}
                        />
                      ))}
                    </div>
                  ) : null}
                </article>
              );
            }

            return (
              <article
                key={objectItem.id}
                data-board-object="true"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  setSelectedObjectId(objectItem.id);
                }}
                style={{
                  position: "absolute",
                  left: objectX,
                  top: objectY,
                  width: objectWidth,
                  height: objectHeight,
                  overflow: "visible",
                  boxShadow: isSelected
                    ? objectItem.type === "line"
                      ? "none"
                      : "0 0 0 2px rgba(59, 130, 246, 0.45), 0 8px 14px rgba(0,0,0,0.14)"
                    : "none",
                  borderRadius:
                    objectItem.type === "circle"
                      ? "999px"
                      : objectItem.type === "line"
                        ? 0
                        : 4
                }}
              >
                <div
                  onPointerDown={(event) => startObjectDrag(objectItem.id, event)}
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: canEdit ? "grab" : "default",
                    border:
                      objectItem.type === "line" ? "none" : "2px solid rgba(15, 23, 42, 0.55)",
                    borderRadius:
                      objectItem.type === "rect"
                        ? 3
                        : objectItem.type === "circle"
                          ? "999px"
                          : 0,
                    background:
                      objectItem.type === "line" ? "transparent" : objectItem.color,
                    boxShadow:
                      objectItem.type === "line" ? "none" : "0 3px 10px rgba(0,0,0,0.08)"
                  }}
                >
                  {objectItem.type === "line" ? (
                    <div
                      style={{
                        width: "100%",
                        height: 4,
                        borderRadius: 999,
                        background: objectItem.color,
                        transform: `rotate(${objectRotationDeg}deg)`,
                        transformOrigin: "center center"
                      }}
                    />
                  ) : null}
                </div>

                {isSelected && canEdit ? (
                  <input
                    type="color"
                    value={objectItem.color}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => void saveObjectColor(objectItem.id, event.target.value)}
                    style={{
                      position: "absolute",
                      top: objectItem.type === "line" ? -30 : 8,
                      right: objectItem.type === "line" ? "auto" : 8,
                      left: objectItem.type === "line" ? "50%" : "auto",
                      transform: objectItem.type === "line" ? "translateX(-50%)" : "none",
                      width: 24,
                      height: 24,
                      border: "1px solid #d1d5db",
                      borderRadius: 4,
                      background: "white",
                      padding: 0
                    }}
                    aria-label="Change shape color"
                  />
                ) : null}

                {isSelected && canEdit && objectItem.type !== "line" ? (
                  <div>
                    {CORNER_HANDLES.map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        onPointerDown={(event) =>
                          startCornerResize(objectItem.id, corner, event)
                        }
                        style={{
                          position: "absolute",
                          ...getCornerPositionStyle(corner),
                          width: RESIZE_HANDLE_SIZE,
                          height: RESIZE_HANDLE_SIZE,
                          border: "1px solid #1d4ed8",
                          borderRadius: 2,
                          background: "white",
                          cursor: getCornerCursor(corner)
                        }}
                        aria-label={`Resize ${corner} corner`}
                      />
                    ))}
                  </div>
                ) : null}

                {isSelected && canEdit && objectItem.type === "line" && lineEndpointOffsets ? (
                  <>
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startLineEndpointResize(objectItem.id, "start", event)
                      }
                      aria-label="Adjust line start"
                      style={{
                        position: "absolute",
                        left: lineEndpointOffsets.start.x - RESIZE_HANDLE_SIZE / 2,
                        top: lineEndpointOffsets.start.y - RESIZE_HANDLE_SIZE / 2,
                        width: RESIZE_HANDLE_SIZE,
                        height: RESIZE_HANDLE_SIZE,
                        borderRadius: "50%",
                        border: "1px solid #1d4ed8",
                        background: "white",
                        cursor: "move"
                      }}
                    />
                    <button
                      type="button"
                      onPointerDown={(event) =>
                        startLineEndpointResize(objectItem.id, "end", event)
                      }
                      aria-label="Adjust line end"
                      style={{
                        position: "absolute",
                        left: lineEndpointOffsets.end.x - RESIZE_HANDLE_SIZE / 2,
                        top: lineEndpointOffsets.end.y - RESIZE_HANDLE_SIZE / 2,
                        width: RESIZE_HANDLE_SIZE,
                        height: RESIZE_HANDLE_SIZE,
                        borderRadius: "50%",
                        border: "1px solid #1d4ed8",
                        background: "white",
                        cursor: "move"
                      }}
                    />
                  </>
                ) : null}
              </article>
            );
          })}
        </div>
        
        {remoteCursors.map((presenceUser) => (
          <div
            key={presenceUser.uid}
            style={{
              position: "absolute",
              left: viewport.x + (presenceUser.cursorX ?? 0) * viewport.scale,
              top: viewport.y + (presenceUser.cursorY ?? 0) * viewport.scale,
              pointerEvents: "none",
              transform: "translate(-2px, -2px)"
            }}
          >
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              style={{
                display: "block",
                filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))"
              }}
              aria-hidden="true"
            >
              <path
                d="M2 1.5 L2 18.8 L6.6 14.9 L9.2 22 L12 20.8 L9.5 13.8 L16.2 13.8 Z"
                fill={presenceUser.color}
                stroke="white"
                strokeWidth="1.15"
                strokeLinejoin="round"
              />
            </svg>
            <div
              style={{
                marginTop: 2,
                marginLeft: 10,
                padding: "2px 6px",
                borderRadius: 999,
                background: presenceUser.color,
                color: "white",
                fontSize: 11,
                whiteSpace: "nowrap"
              }}
            >
              {getPresenceLabel(presenceUser)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
