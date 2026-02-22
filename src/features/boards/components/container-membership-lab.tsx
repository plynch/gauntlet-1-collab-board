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
  getGridSectionBoundsFromGeometry,
  toSectionRelativeCoordinate,
} from "@/features/boards/components/realtime-canvas/container-membership-geometry";
import {
  buildInitialState,
  CONTAINER_GAP,
  CONTAINER_GEOMETRY,
  getContainerBounds,
  getObjectCenterFromState,
  getSectionIndexForCenter,
  LabState,
  OBJECT_SIZE,
  pointInsideBounds,
  snapStateToDimensions,
  STAGE_HEIGHT,
  STAGE_PADDING,
  STAGE_WIDTH,
} from "@/features/boards/components/container-membership-lab-logic";
import {
  containerStyle,
  labelStyle,
  mainStyle,
  objectStyle,
  sectionLabelStyle,
  sectionStyle,
  stageStyle,
  statLineStyle,
  statsStyle,
} from "@/features/boards/components/container-membership-lab-styles";

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

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
    setLabState((previous) => snapStateToDimensions(previous, nextRows, nextCols));
  };

  const handleObjectPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
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

  const handleObjectPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
        return { ...previous, sectionIndex: null };
      }
      const sectionIndex = getSectionIndexForCenter(center, sections);
      if (sectionIndex === null) {
        return { ...previous, sectionIndex: null };
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

  return (
    <main style={mainStyle}>
      <section style={stageStyle}>
        <div data-testid="lab-container" style={containerStyle}>
          {sections.map((section, index) => (
            <div
              key={index}
              data-testid={`lab-section-${index}`}
              data-left={section.left}
              data-right={section.right}
              data-top={section.top}
              data-bottom={section.bottom}
              style={{
                ...sectionStyle,
                left: section.left - CONTAINER_GEOMETRY.x,
                top: section.top - CONTAINER_GEOMETRY.y,
                width: section.right - section.left,
                height: section.bottom - section.top,
              }}
            >
              <span data-testid={`lab-section-label-${index}`} style={sectionLabelStyle}>
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
            ...objectStyle,
            left: labState.objectX,
            top: labState.objectY,
            width: OBJECT_SIZE.width,
            height: OBJECT_SIZE.height,
          }}
        />

        <aside style={statsStyle}>
          <label style={labelStyle}>
            Rows
            <select
              data-testid="row-select"
              value={rows}
              onChange={(event) => applyDimensions(Number(event.target.value), cols)}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Cols
            <select
              data-testid="col-select"
              value={cols}
              onChange={(event) => applyDimensions(rows, Number(event.target.value))}
            >
              {[1, 2, 3, 4].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <p style={statLineStyle}>
            Active grid: <strong data-testid="active-rows">{rows}</strong> x{" "}
            <strong data-testid="active-cols">{cols}</strong>
          </p>
          <p style={statLineStyle}>
            Assigned section:{" "}
            <strong data-testid="assigned-section">
              {labState.sectionIndex === null ? "none" : String(labState.sectionIndex)}
            </strong>
          </p>
          <p style={statLineStyle}>
            Object position:{" "}
            <strong data-testid="object-position">
              {`${Math.round(labState.objectX)},${Math.round(labState.objectY)}`}
            </strong>
          </p>
        </aside>
      </section>
    </main>
  );
}
