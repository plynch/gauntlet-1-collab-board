import type { PointerEvent as ReactPointerEvent } from "react";

import { getStickyCenter, SECTION_TITLES, STAGE_HEIGHT, STAGE_WIDTH } from "@/features/boards/components/swot-resize-lab-model";
import type { BoardObject } from "@/features/boards/types";

type SwotResizeLabStageProps = {
  userEmail: string;
  containerObject: BoardObject | null;
  sections: Array<{ left: number; right: number; top: number; bottom: number }>;
  stickyObjects: BoardObject[];
  onCreateSwot: () => void;
  onAddStickyToSection: (sectionIndex: number) => void;
  onResizePointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizePointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onResizePointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

export function SwotResizeLabStage({
  userEmail,
  containerObject,
  sections,
  stickyObjects,
  onCreateSwot,
  onAddStickyToSection,
  onResizePointerDown,
  onResizePointerMove,
  onResizePointerUp,
}: SwotResizeLabStageProps) {
  return (
    <section style={stageStyle}>
      <header style={headerStyle}>
        <div data-testid="signed-in-user" style={{ color: "#0f172a", fontSize: 13 }}>
          Signed in as {userEmail}
        </div>
        {!containerObject ? (
          <button
            type="button"
            data-testid="create-swot-button"
            onClick={onCreateSwot}
            style={createButtonStyle}
          >
            Create SWOT analysis
          </button>
        ) : null}
      </header>

      {containerObject ? (
        <>
          <aside style={controlsStyle}>
            <div style={{ fontSize: 12, color: "#334155", fontWeight: 600 }}>
              Add sticky by quadrant
            </div>
            {SECTION_TITLES.map((title, index) => (
              <button
                key={title}
                type="button"
                data-testid={`add-sticky-section-${index}`}
                onClick={() => onAddStickyToSection(index)}
                style={sectionActionStyle}
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
              ...containerStyle,
              left: containerObject.x,
              top: containerObject.y,
              width: containerObject.width,
              height: containerObject.height,
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
                  ...sectionStyle,
                  left: section.left - containerObject.x,
                  top: section.top - containerObject.y,
                  width: section.right - section.left,
                  height: section.bottom - section.top,
                }}
              >
                <span style={sectionLabelStyle}>{SECTION_TITLES[index]}</span>
              </div>
            ))}
            <button
              type="button"
              data-testid="swot-resize-handle"
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              style={resizeHandleStyle}
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
              ...stickyStyle,
              left: sticky.x,
              top: sticky.y,
              width: sticky.width,
              height: sticky.height,
              background: sticky.color,
            }}
          >
            {sticky.text}
          </div>
        );
      })}
    </section>
  );
}

const stageStyle = {
  width: STAGE_WIDTH,
  height: STAGE_HEIGHT,
  position: "relative",
  border: "1px solid #94a3b8",
  backgroundColor: "#f8fafc",
  backgroundImage:
    "linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(90deg, #e5e7eb 1px, transparent 1px)",
  backgroundSize: "28px 28px",
  overflow: "hidden",
} as const;

const headerStyle = {
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
} as const;

const createButtonStyle = {
  borderRadius: 8,
  border: "1px solid #0f766e",
  background: "#0f766e",
  color: "white",
  padding: "8px 12px",
  fontWeight: 600,
} as const;

const controlsStyle = {
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
} as const;

const sectionActionStyle = {
  borderRadius: 8,
  border: "1px solid #94a3b8",
  background: "white",
  color: "#0f172a",
  padding: "6px 8px",
  fontSize: 12,
  textAlign: "left",
} as const;

const containerStyle = {
  position: "absolute",
  border: "2px solid #334155",
  borderRadius: 10,
  background: "rgba(255,255,255,0.6)",
  boxSizing: "border-box",
} as const;

const sectionStyle = {
  position: "absolute",
  border: "1px solid rgba(51, 65, 85, 0.3)",
  borderRadius: 4,
  background: "rgba(241, 245, 249, 0.38)",
  boxSizing: "border-box",
} as const;

const sectionLabelStyle = {
  display: "inline-flex",
  margin: 4,
  padding: "2px 6px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.92)",
  fontSize: 11,
  color: "#334155",
} as const;

const resizeHandleStyle = {
  position: "absolute",
  right: -8,
  bottom: -8,
  width: 18,
  height: 18,
  borderRadius: 4,
  border: "1px solid #1d4ed8",
  background: "white",
  cursor: "nwse-resize",
} as const;

const stickyStyle = {
  position: "absolute",
  borderRadius: 10,
  border: "1px solid rgba(15,23,42,0.3)",
  color: "#111827",
  display: "grid",
  placeItems: "center",
  fontSize: 13,
  fontWeight: 600,
} as const;
