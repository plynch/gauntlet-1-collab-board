"use client";

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  clampObjectTopLeftToSection,
  clampToRange,
  getClosestSectionIndex,
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
  type ContainerBoardPoint,
  type ContainerObjectBounds,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";

type LabState = {
  objectX: number;
  objectY: number;
  sectionIndex: number | null;
  relX: number;
  relY: number;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const STAGE_WIDTH = 980;
const STAGE_HEIGHT = 700;
const STAGE_PADDING = 12;
const CONTAINER_GAP = 2;
const CONTAINER_GEOMETRY = {
  x: 140,
  y: 110,
  width: 620,
  height: 420,
};
const OBJECT_SIZE = {
  width: 108,
  height: 72,
};

function pointInsideBounds(
  point: ContainerBoardPoint,
  bounds: ContainerObjectBounds,
): boolean {
  return (
    point.x >= bounds.left &&
    point.x <= bounds.right &&
    point.y >= bounds.top &&
    point.y <= bounds.bottom
  );
}

function getContainerBounds(): ContainerObjectBounds {
  return {
    left: CONTAINER_GEOMETRY.x,
    right: CONTAINER_GEOMETRY.x + CONTAINER_GEOMETRY.width,
    top: CONTAINER_GEOMETRY.y,
    bottom: CONTAINER_GEOMETRY.y + CONTAINER_GEOMETRY.height,
  };
}

function getObjectCenterFromState(state: LabState): ContainerBoardPoint {
  return {
    x: state.objectX + OBJECT_SIZE.width / 2,
    y: state.objectY + OBJECT_SIZE.height / 2,
  };
}

function getSectionIndexForCenter(
  center: ContainerBoardPoint,
  sections: ContainerObjectBounds[],
): number | null {
  const containingSectionIndex = sections.findIndex((section) =>
    pointInsideBounds(center, section),
  );
  if (containingSectionIndex >= 0) {
    return containingSectionIndex;
  }

  return getClosestSectionIndex(center, sections);
}

function snapStateToDimensions(
  state: LabState,
  rows: number,
  cols: number,
): LabState {
  if (state.sectionIndex === null) {
    return state;
  }

  const sections = getGridSectionBoundsFromGeometry(
    CONTAINER_GEOMETRY,
    rows,
    cols,
    CONTAINER_GAP,
  );
  if (sections.length === 0) {
    return { ...state, sectionIndex: null };
  }

  const normalizedSectionIndex = clampToRange(
    state.sectionIndex,
    0,
    sections.length - 1,
  );
  const section = sections[normalizedSectionIndex];
  const sectionWidth = Math.max(1, section.right - section.left);
  const sectionHeight = Math.max(1, section.bottom - section.top);
  const relX = clampToRange(state.relX, 0, 1);
  const relY = clampToRange(state.relY, 0, 1);
  const preferredTopLeft = {
    x: section.left + relX * sectionWidth - OBJECT_SIZE.width / 2,
    y: section.top + relY * sectionHeight - OBJECT_SIZE.height / 2,
  };
  const clampedTopLeft = clampObjectTopLeftToSection(
    section,
    OBJECT_SIZE,
    preferredTopLeft,
  );
  const clampedCenter = {
    x: clampedTopLeft.x + OBJECT_SIZE.width / 2,
    y: clampedTopLeft.y + OBJECT_SIZE.height / 2,
  };
  const nextRelative = toSectionRelativeCoordinate(clampedCenter, section);

  return {
    objectX: clampedTopLeft.x,
    objectY: clampedTopLeft.y,
    sectionIndex: normalizedSectionIndex,
    relX: nextRelative.x,
    relY: nextRelative.y,
  };
}

function buildInitialState(): LabState {
  const sections = getGridSectionBoundsFromGeometry(
    CONTAINER_GEOMETRY,
    2,
    2,
    CONTAINER_GAP,
  );
  const section = sections[0];
  const preferredTopLeft = {
    x: section.left + 24,
    y: section.top + 18,
  };
  const clampedTopLeft = clampObjectTopLeftToSection(
    section,
    OBJECT_SIZE,
    preferredTopLeft,
  );
  const center = {
    x: clampedTopLeft.x + OBJECT_SIZE.width / 2,
    y: clampedTopLeft.y + OBJECT_SIZE.height / 2,
  };
  const rel = toSectionRelativeCoordinate(center, section);

  return {
    objectX: clampedTopLeft.x,
    objectY: clampedTopLeft.y,
    sectionIndex: 0,
    relX: rel.x,
    relY: rel.y,
  };
}

export default function ContainerMembershipLab() {
  const [rows, setRows] = useState(2);
  const [cols, setCols] = useState(2);
  const [labState, setLabState] = useState<LabState>(() => buildInitialState());
  const dragRef = useRef<DragState | null>(null);

  const sections = useMemo(
    () =>
      getGridSectionBoundsFromGeometry(
        CONTAINER_GEOMETRY,
        rows,
        cols,
        CONTAINER_GAP,
      ),
    [rows, cols],
  );

    const applyDimensions = (nextRowsRaw: number, nextColsRaw: number) => {
    const nextRows = Math.max(1, Math.min(4, Math.floor(nextRowsRaw)));
    const nextCols = Math.max(1, Math.min(4, Math.floor(nextColsRaw)));
    setRows(nextRows);
    setCols(nextCols);
    setLabState((previous) =>
      snapStateToDimensions(previous, nextRows, nextCols),
    );
  };

    const handleObjectPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: labState.objectX,
      originY: labState.objectY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

    const handleObjectPointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;
    setLabState((previous) => ({
      ...previous,
      objectX: clampToRange(
        dragState.originX + deltaX,
        STAGE_PADDING,
        STAGE_WIDTH - STAGE_PADDING - OBJECT_SIZE.width,
      ),
      objectY: clampToRange(
        dragState.originY + deltaY,
        STAGE_PADDING,
        STAGE_HEIGHT - STAGE_PADDING - OBJECT_SIZE.height,
      ),
    }));
  };

    const handleObjectPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);

    setLabState((previous) => {
      const center = getObjectCenterFromState(previous);
      const containerBounds = getContainerBounds();
      if (!pointInsideBounds(center, containerBounds)) {
        return {
          ...previous,
          sectionIndex: null,
        };
      }

      const sectionIndex = getSectionIndexForCenter(center, sections);
      if (sectionIndex === null) {
        return {
          ...previous,
          sectionIndex: null,
        };
      }

      const section = sections[sectionIndex];
      const clampedTopLeft = clampObjectTopLeftToSection(section, OBJECT_SIZE, {
        x: previous.objectX,
        y: previous.objectY,
      });
      const clampedCenter = {
        x: clampedTopLeft.x + OBJECT_SIZE.width / 2,
        y: clampedTopLeft.y + OBJECT_SIZE.height / 2,
      };
      const rel = toSectionRelativeCoordinate(clampedCenter, section);

      return {
        objectX: clampedTopLeft.x,
        objectY: clampedTopLeft.y,
        sectionIndex,
        relX: rel.x,
        relY: rel.y,
      };
    });
  };

  const assignedSectionLabel =
    labState.sectionIndex === null ? "none" : String(labState.sectionIndex);
  const objectPositionLabel = `${Math.round(labState.objectX)},${Math.round(labState.objectY)}`;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#e5e7eb",
        padding: 24,
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
        }}
      >
        <div
          data-testid="lab-container"
          style={{
            position: "absolute",
            left: CONTAINER_GEOMETRY.x,
            top: CONTAINER_GEOMETRY.y,
            width: CONTAINER_GEOMETRY.width,
            height: CONTAINER_GEOMETRY.height,
            border: "2px solid #334155",
          }}
        >
          {sections.map((section, index) => (
            <div
              key={index}
              data-testid={`lab-section-${index}`}
              data-left={section.left}
              data-right={section.right}
              data-top={section.top}
              data-bottom={section.bottom}
              style={{
                position: "absolute",
                left: section.left - CONTAINER_GEOMETRY.x,
                top: section.top - CONTAINER_GEOMETRY.y,
                width: section.right - section.left,
                height: section.bottom - section.top,
                border: "1px solid rgba(51, 65, 85, 0.4)",
                background: "rgba(226, 232, 240, 0.2)",
                boxSizing: "border-box",
                pointerEvents: "none",
              }}
            >
              <span
                data-testid={`lab-section-label-${index}`}
                style={{
                  display: "inline-flex",
                  margin: 4,
                  padding: "1px 6px",
                  borderRadius: 999,
                  fontSize: 11,
                  background: "rgba(255,255,255,0.9)",
                  color: "#334155",
                }}
              >
                Section {index}
              </span>
            </div>
          ))}
        </div>

        <div
          data-testid="lab-object"
          onPointerDown={handleObjectPointerDown}
          onPointerMove={handleObjectPointerMove}
          onPointerUp={handleObjectPointerUp}
          style={{
            position: "absolute",
            left: labState.objectX,
            top: labState.objectY,
            width: OBJECT_SIZE.width,
            height: OBJECT_SIZE.height,
            borderRadius: 8,
            background: "#93c5fd",
            border: "2px solid #1d4ed8",
            cursor: "grab",
          }}
        />

        <aside
          style={{
            position: "absolute",
            left: 16,
            top: 16,
            display: "grid",
            gap: 8,
            padding: 10,
            borderRadius: 10,
            border: "1px solid #94a3b8",
            background: "rgba(255,255,255,0.96)",
            minWidth: 230,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            Rows
            <select
              data-testid="row-select"
              value={rows}
              onChange={(event) => {
                applyDimensions(Number(event.target.value), cols);
              }}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 12,
            }}
          >
            Cols
            <select
              data-testid="col-select"
              value={cols}
              onChange={(event) => {
                applyDimensions(rows, Number(event.target.value));
              }}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <p style={{ margin: 0, fontSize: 12 }}>
            Active grid: <strong data-testid="active-rows">{rows}</strong> x{" "}
            <strong data-testid="active-cols">{cols}</strong>
          </p>
          <p style={{ margin: 0, fontSize: 12 }}>
            Assigned section:{" "}
            <strong data-testid="assigned-section">
              {assignedSectionLabel}
            </strong>
          </p>
          <p style={{ margin: 0, fontSize: 12 }}>
            Object position:{" "}
            <strong data-testid="object-position">{objectPositionLabel}</strong>
          </p>
        </aside>
      </section>
    </main>
  );
}
