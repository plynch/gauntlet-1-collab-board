"use client";

import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useContainerMembership } from "@/features/boards/components/realtime-canvas/use-container-membership";
import {
  clampObjectTopLeftToSection,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import type { BoardObject, BoardObjectKind } from "@/features/boards/types";

type LabUser = {
  uid: string;
  email: string;
};

type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  initialWidth: number;
  initialHeight: number;
};

type ObjectGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
};

const STAGE_WIDTH = 1240;
const STAGE_HEIGHT = 860;
const CONTAINER_ID = "lab-swot-container";
const GRID_ROWS = 2;
const GRID_COLS = 2;
const GRID_GAP = 2;
const SECTION_TITLES = [
  "Strengths",
  "Weaknesses",
  "Opportunities",
  "Threats",
] as const;
const STICKY_SIZE = { width: 118, height: 76 };
const MIN_CONTAINER_WIDTH = 420;
const MIN_CONTAINER_HEIGHT = 300;

const RELATIVE_POSITION_PRESETS: Array<{ x: number; y: number }> = [
  { x: 0.32, y: 0.28 },
  { x: 0.62, y: 0.42 },
  { x: 0.48, y: 0.68 },
  { x: 0.72, y: 0.26 },
];

/**
 * Returns whether connector kind is true.
 */
function isConnectorKind(kind: BoardObjectKind): boolean {
  return (
    kind === "connectorUndirected" ||
    kind === "connectorArrow" ||
    kind === "connectorBidirectional"
  );
}

/**
 * Handles round to step.
 */
function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Gets distance.
 */
function getDistance(
  left: { x: number; y: number },
  right: { x: number; y: number },
): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

/**
 * Builds container object.
 */
function buildContainerObject(overrides?: Partial<BoardObject>): BoardObject {
  return {
    id: CONTAINER_ID,
    type: "gridContainer",
    zIndex: 1,
    x: 180,
    y: 150,
    width: 640,
    height: 420,
    rotationDeg: 0,
    color: "#e2e8f0",
    text: "",
    gridRows: GRID_ROWS,
    gridCols: GRID_COLS,
    gridGap: GRID_GAP,
    gridCellColors: ["#d1fae5", "#a7f3d0", "#fee2e2", "#fecaca"],
    containerTitle: "SWOT Analysis",
    gridSectionTitles: [...SECTION_TITLES],
    gridSectionNotes: ["", "", "", ""],
    updatedAt: null,
    ...overrides,
  };
}

/**
 * Gets object geometry.
 */
function getObjectGeometry(objectItem: BoardObject): ObjectGeometry {
  return {
    x: objectItem.x,
    y: objectItem.y,
    width: objectItem.width,
    height: objectItem.height,
    rotationDeg: objectItem.rotationDeg,
  };
}

/**
 * Gets sticky center.
 */
function getStickyCenter(sticky: BoardObject): { x: number; y: number } {
  return {
    x: sticky.x + sticky.width / 2,
    y: sticky.y + sticky.height / 2,
  };
}

/**
 * Handles swot resize lab.
 */
export default function SwotResizeLab() {
  const [user, setUser] = useState<LabUser | null>(null);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [stickySequence, setStickySequence] = useState(0);
  const resizeStateRef = useRef<ResizeState | null>(null);
  const objectsByIdRef = useRef<Map<string, BoardObject>>(new Map());

  const objectsById = useMemo(() => {
    const map = new Map<string, BoardObject>();
    objects.forEach((objectItem) => {
      map.set(objectItem.id, objectItem);
    });
    return map;
  }, [objects]);

  useEffect(() => {
    objectsByIdRef.current = objectsById;
  }, [objectsById]);

  const getCurrentObjectGeometry = useCallback(
    (objectId: string): ObjectGeometry | null => {
      const objectItem = objectsByIdRef.current.get(objectId);
      return objectItem ? getObjectGeometry(objectItem) : null;
    },
    [],
  );

  const { getSectionAnchoredObjectUpdatesForContainer } =
    useContainerMembership({
      objectsByIdRef,
      getCurrentObjectGeometry,
      maxRows: 6,
      maxCols: 6,
      defaultGap: GRID_GAP,
      getDistance,
      roundToStep,
      isConnectorKind,
    });

  const containerObject = objectsById.get(CONTAINER_ID) ?? null;
  const sections = containerObject
    ? getGridSectionBoundsFromGeometry(
        getObjectGeometry(containerObject),
        Math.max(1, containerObject.gridRows ?? GRID_ROWS),
        Math.max(1, containerObject.gridCols ?? GRID_COLS),
        Math.max(0, containerObject.gridGap ?? GRID_GAP),
      )
    : [];
  const stickyObjects = objects
    .filter((objectItem) => objectItem.type === "sticky")
    .sort((left, right) => left.id.localeCompare(right.id));

  const applyContainerResize = useCallback(
    (nextWidthRaw: number, nextHeightRaw: number) => {
      const currentContainer = objectsByIdRef.current.get(CONTAINER_ID);
      if (!currentContainer || currentContainer.type !== "gridContainer") {
        return;
      }

      const nextGeometry: ObjectGeometry = {
        x: currentContainer.x,
        y: currentContainer.y,
        width: Math.max(MIN_CONTAINER_WIDTH, nextWidthRaw),
        height: Math.max(MIN_CONTAINER_HEIGHT, nextHeightRaw),
        rotationDeg: 0,
      };
      const nextRows = Math.max(1, currentContainer.gridRows ?? GRID_ROWS);
      const nextCols = Math.max(1, currentContainer.gridCols ?? GRID_COLS);
      const nextGap = Math.max(0, currentContainer.gridGap ?? GRID_GAP);

      const childUpdates = getSectionAnchoredObjectUpdatesForContainer(
        CONTAINER_ID,
        nextGeometry,
        nextRows,
        nextCols,
        nextGap,
      );

      setObjects((previous) =>
        previous.map((objectItem) => {
          if (objectItem.id === CONTAINER_ID) {
            return {
              ...objectItem,
              width: nextGeometry.width,
              height: nextGeometry.height,
            };
          }

          const nextPosition = childUpdates.positionByObjectId[objectItem.id];
          const nextMembership =
            childUpdates.membershipByObjectId[objectItem.id];
          if (!nextPosition || !nextMembership) {
            return objectItem;
          }

          return {
            ...objectItem,
            x: nextPosition.x,
            y: nextPosition.y,
            containerId: nextMembership.containerId,
            containerSectionIndex: nextMembership.containerSectionIndex,
            containerRelX: nextMembership.containerRelX,
            containerRelY: nextMembership.containerRelY,
          };
        }),
      );
    },
    [getSectionAnchoredObjectUpdatesForContainer],
  );

  /**
   * Handles handle resize pointer down.
   */
  const handleResizePointerDown = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (event.button !== 0 || !containerObject) {
      return;
    }

    event.preventDefault();
    resizeStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initialWidth: containerObject.width,
      initialHeight: containerObject.height,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  /**
   * Handles handle resize pointer move.
   */
  const handleResizePointerMove = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - resizeState.startX;
    const deltaY = event.clientY - resizeState.startY;
    applyContainerResize(
      resizeState.initialWidth + deltaX,
      resizeState.initialHeight + deltaY,
    );
  };

  /**
   * Handles handle resize pointer up.
   */
  const handleResizePointerUp = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const resizeState = resizeStateRef.current;
    if (!resizeState || resizeState.pointerId !== event.pointerId) {
      return;
    }
    resizeStateRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  /**
   * Creates swot.
   */
  const createSwot = () => {
    setObjects([buildContainerObject()]);
    setStickySequence(0);
  };

  /**
   * Handles add sticky to section.
   */
  const addStickyToSection = (sectionIndex: number) => {
    const currentContainer = objectsByIdRef.current.get(CONTAINER_ID);
    if (!currentContainer || currentContainer.type !== "gridContainer") {
      return;
    }

    const rows = Math.max(1, currentContainer.gridRows ?? GRID_ROWS);
    const cols = Math.max(1, currentContainer.gridCols ?? GRID_COLS);
    const gap = Math.max(0, currentContainer.gridGap ?? GRID_GAP);
    const allSections = getGridSectionBoundsFromGeometry(
      getObjectGeometry(currentContainer),
      rows,
      cols,
      gap,
    );
    const section = allSections[sectionIndex];
    if (!section) {
      return;
    }

    const existingInSection = Array.from(
      objectsByIdRef.current.values(),
    ).filter(
      (objectItem) =>
        objectItem.type === "sticky" &&
        objectItem.containerSectionIndex === sectionIndex,
    ).length;
    const preset =
      RELATIVE_POSITION_PRESETS[
        existingInSection % RELATIVE_POSITION_PRESETS.length
      ];
    const sectionWidth = Math.max(1, section.right - section.left);
    const sectionHeight = Math.max(1, section.bottom - section.top);
    const preferredTopLeft = {
      x: section.left + preset.x * sectionWidth - STICKY_SIZE.width / 2,
      y: section.top + preset.y * sectionHeight - STICKY_SIZE.height / 2,
    };
    const clampedTopLeft = clampObjectTopLeftToSection(
      section,
      STICKY_SIZE,
      preferredTopLeft,
    );
    const center = {
      x: clampedTopLeft.x + STICKY_SIZE.width / 2,
      y: clampedTopLeft.y + STICKY_SIZE.height / 2,
    };
    const rel = toSectionRelativeCoordinate(center, section);
    const nextId = `sticky-${stickySequence + 1}`;
    setStickySequence((previous) => previous + 1);
    setObjects((previous) => [
      ...previous,
      {
        id: nextId,
        type: "sticky",
        zIndex: 10 + previous.length,
        x: clampedTopLeft.x,
        y: clampedTopLeft.y,
        width: STICKY_SIZE.width,
        height: STICKY_SIZE.height,
        rotationDeg: 0,
        color: "#fde68a",
        text: `S${sectionIndex + 1}-${existingInSection + 1}`,
        containerId: CONTAINER_ID,
        containerSectionIndex: sectionIndex,
        containerRelX: rel.x,
        containerRelY: rel.y,
        updatedAt: null,
      },
    ]);
  };

  if (!user) {
    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#e5e7eb",
        }}
      >
        <section
          style={{
            width: 520,
            padding: 24,
            borderRadius: 12,
            border: "1px solid #cbd5e1",
            background: "#f8fafc",
            display: "grid",
            gap: 12,
          }}
        >
          <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>
            SWOT Resize E2E Lab
          </h1>
          <p style={{ margin: 0, color: "#334155" }}>
            Simulates sign-in and board interactions for deterministic
            end-to-end tests.
          </p>
          <button
            type="button"
            data-testid="sign-in-new-user"
            onClick={() => {
              setUser({
                uid: "e2e-new-user",
                email: "new.user.e2e@example.com",
              });
            }}
            style={{
              width: 220,
              borderRadius: 8,
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "white",
              padding: "10px 14px",
              fontWeight: 600,
            }}
          >
            Sign in as new user
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#e5e7eb",
        padding: 20,
      }}
    >
      <section
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          position: "relative",
          border: "1px solid #94a3b8",
          backgroundColor: "#f8fafc",
          backgroundImage:
            "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            zIndex: 20,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 14px",
            borderBottom: "1px solid #cbd5e1",
            background: "rgba(248, 250, 252, 0.96)",
          }}
        >
          <div
            data-testid="signed-in-user"
            style={{ color: "#0f172a", fontSize: 13 }}
          >
            Signed in as {user.email}
          </div>
          {!containerObject ? (
            <button
              type="button"
              data-testid="create-swot-button"
              onClick={createSwot}
              style={{
                borderRadius: 8,
                border: "1px solid #0f766e",
                background: "#0f766e",
                color: "white",
                padding: "8px 12px",
                fontWeight: 600,
              }}
            >
              Create SWOT analysis
            </button>
          ) : null}
        </header>

        {containerObject ? (
          <>
            <aside
              style={{
                position: "absolute",
                left: 16,
                top: 60,
                zIndex: 18,
                display: "grid",
                gap: 8,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #cbd5e1",
                background: "rgba(255,255,255,0.95)",
              }}
            >
              <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>
                Add sticky by quadrant
              </div>
              {SECTION_TITLES.map((title, index) => (
                <button
                  key={title}
                  type="button"
                  data-testid={`add-sticky-section-${index}`}
                  onClick={() => addStickyToSection(index)}
                  style={{
                    borderRadius: 8,
                    border: "1px solid #94a3b8",
                    background: "white",
                    color: "#0f172a",
                    padding: "6px 8px",
                    fontSize: 12,
                    textAlign: "left",
                  }}
                >
                  {title}
                </button>
              ))}
            </aside>

            <article
              data-testid="swot-container"
              data-width={containerObject.width}
              data-height={containerObject.height}
              style={{
                position: "absolute",
                left: containerObject.x,
                top: containerObject.y,
                width: containerObject.width,
                height: containerObject.height,
                border: "2px solid #334155",
                borderRadius: 10,
                background: "rgba(255,255,255,0.6)",
                boxSizing: "border-box",
              }}
            >
              {sections.map((section, index) => (
                <div
                  key={index}
                  data-testid={`swot-section-${index}`}
                  data-left={section.left}
                  data-right={section.right}
                  data-top={section.top}
                  data-bottom={section.bottom}
                  style={{
                    position: "absolute",
                    left: section.left - containerObject.x,
                    top: section.top - containerObject.y,
                    width: section.right - section.left,
                    height: section.bottom - section.top,
                    border: "1px solid rgba(51, 65, 85, 0.3)",
                    borderRadius: 4,
                    background: "rgba(241, 245, 249, 0.38)",
                    boxSizing: "border-box",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      margin: 4,
                      padding: "2px 6px",
                      borderRadius: 999,
                      background: "rgba(255,255,255,0.92)",
                      fontSize: 11,
                      color: "#334155",
                    }}
                  >
                    {SECTION_TITLES[index]}
                  </span>
                </div>
              ))}
              <button
                type="button"
                data-testid="swot-resize-handle"
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerUp}
                style={{
                  position: "absolute",
                  right: -8,
                  bottom: -8,
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: "1px solid #1d4ed8",
                  background: "white",
                  cursor: "nwse-resize",
                }}
                aria-label="Resize SWOT container"
              />
            </article>
          </>
        ) : null}

        {stickyObjects.map((sticky) => {
          const center = getStickyCenter(sticky);
          return (
            <div
              key={sticky.id}
              data-testid={`swot-sticky-${sticky.id}`}
              data-section-index={String(sticky.containerSectionIndex ?? -1)}
              data-rel-x={String(sticky.containerRelX ?? -1)}
              data-rel-y={String(sticky.containerRelY ?? -1)}
              data-center-x={String(center.x)}
              data-center-y={String(center.y)}
              style={{
                position: "absolute",
                left: sticky.x,
                top: sticky.y,
                width: sticky.width,
                height: sticky.height,
                borderRadius: 10,
                border: "1px solid rgba(15,23,42,0.3)",
                background: sticky.color,
                color: "#111827",
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {sticky.text}
            </div>
          );
        })}
      </section>
    </main>
  );
}
