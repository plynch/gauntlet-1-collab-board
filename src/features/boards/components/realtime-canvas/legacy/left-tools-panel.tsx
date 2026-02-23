import type { ReactNode } from "react";
import { BriefcaseIcon, DuplicateIcon, ToolIcon, TrashIcon } from "@/features/boards/components/realtime-canvas/canvas-controls";
import { getObjectLabel } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { BOARD_TOOLS } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
type LeftToolsPanelProps = {
  isCollapsed: boolean;
  canEdit: boolean;
  isAiSubmitting: boolean;
  isSwotTemplateCreating: boolean;
  hasDeletableSelection: boolean;
  selectedObjectCount: number;
  resolvedTheme: "light" | "dark";
  onCollapse: () => void;
  onExpand: () => void;
  onToolButtonClick: (toolKind: (typeof BOARD_TOOLS)[number]) => void;
  onCreateSwot: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function LeftToolsPanel({
  isCollapsed,
  canEdit,
  isAiSubmitting,
  isSwotTemplateCreating,
  hasDeletableSelection,
  selectedObjectCount,
  resolvedTheme,
  onCollapse,
  onExpand,
  onToolButtonClick,
  onCreateSwot,
  onDuplicate,
  onDelete,
  children,
}: LeftToolsPanelProps) {
  return (
    <aside
      style={{
        minWidth: 0,
        minHeight: 0,
        background: "var(--surface-muted)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {isCollapsed ? (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <button
            type="button"
            onClick={onExpand}
            title="Expand tools panel"
            aria-label="Expand tools panel"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderRight: "1px solid var(--border-strong)",
              borderRadius: 0,
              background: "var(--surface-subtle)",
              color: "var(--text)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>{">"}</span>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              Tools
            </span>
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              padding: 0,
              borderBottom: "1px solid var(--border)",
              display: "grid",
            }}
          >
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse tools panel"
              aria-label="Collapse tools panel"
              style={{
                width: "100%",
                height: 30,
                border: "none",
                borderRadius: 0,
                borderBottom: "1px solid var(--border-strong)",
                background: "var(--surface-subtle)",
                color: "var(--text)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 0.3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                cursor: "pointer",
                transition:
                  "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
              }}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>{"<"}</span>
              <span>Tools</span>
            </button>
          </div>
          <div
            style={{
              minHeight: 0,
              overflowY: "auto",
              overflowX: "hidden",
              padding: "0.65rem",
              display: "grid",
              gap: "0.7rem",
              alignContent: "start",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 42px)",
                justifyContent: "center",
                gap: "0.45rem",
                overflow: "visible",
              }}
            >
              {BOARD_TOOLS.map((toolKind) => (
                <button
                  key={toolKind}
                  type="button"
                  onClick={() => onToolButtonClick(toolKind)}
                  disabled={!canEdit}
                  title={`Add ${getObjectLabel(toolKind).toLowerCase()}`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 42,
                    minWidth: 42,
                    maxWidth: 42,
                    minHeight: 42,
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    background: "var(--surface)",
                    height: 42,
                    padding: 0,
                    lineHeight: 0,
                    overflow: "visible",
                  }}
                >
                  <ToolIcon kind={toolKind} />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => onToolButtonClick("rect")}
              disabled={!canEdit}
              title="Create free-form frame"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                border:
                  !canEdit
                    ? "1px solid var(--border)"
                    : resolvedTheme === "dark"
                      ? "1px solid rgba(129, 140, 248, 0.56)"
                      : "1px solid #c7d2fe",
                borderRadius: 8,
                background:
                  !canEdit
                    ? "var(--surface-muted)"
                    : resolvedTheme === "dark"
                      ? "rgba(79, 70, 229, 0.24)"
                      : "#e0e7ff",
                color: !canEdit ? "var(--text-muted)" : resolvedTheme === "dark" ? "#c7d2fe" : "#312e81",
                height: 34,
                fontSize: 12,
                fontWeight: 700,
                cursor: !canEdit ? "not-allowed" : "pointer",
                transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
              }}
            >
              <ToolIcon kind="rect" />
              <span>Frame (New)</span>
            </button>
            <button
              type="button"
              onClick={onCreateSwot}
              disabled={!canEdit || isAiSubmitting || isSwotTemplateCreating}
              title="Create SWOT analysis"
              style={{
                width: "100%",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                border:
                  !canEdit || isAiSubmitting || isSwotTemplateCreating
                    ? "1px solid var(--border)"
                    : resolvedTheme === "dark"
                      ? "1px solid rgba(129, 140, 248, 0.56)"
                      : "1px solid #c7d2fe",
                borderRadius: 8,
                background:
                  !canEdit || isAiSubmitting || isSwotTemplateCreating
                    ? "var(--surface-muted)"
                    : resolvedTheme === "dark"
                      ? "rgba(79, 70, 229, 0.24)"
                      : "#e0e7ff",
                color:
                  !canEdit || isAiSubmitting || isSwotTemplateCreating
                    ? "var(--text-muted)"
                    : resolvedTheme === "dark"
                      ? "#c7d2fe"
                      : "#312e81",
                height: 34,
                fontSize: 12,
                fontWeight: 600,
                cursor:
                  !canEdit || isAiSubmitting || isSwotTemplateCreating
                    ? "not-allowed"
                    : "pointer",
                transition: "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
              }}
            >
              <BriefcaseIcon />
              <span>SWOT</span>
            </button>

            {hasDeletableSelection ? (
              <button
                type="button"
                onClick={onDuplicate}
                title="Duplicate selected objects"
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  background: "var(--surface)",
                  color: "var(--text)",
                  height: 34,
                  fontSize: 12,
                }}
              >
                <DuplicateIcon />
                <span>Duplicate ({selectedObjectCount})</span>
              </button>
            ) : null}

            {hasDeletableSelection ? (
              <button
                type="button"
                onClick={onDelete}
                title="Delete selected objects"
                style={{
                  width: "100%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  background: "rgba(239, 68, 68, 0.14)",
                  color: "#991b1b",
                  height: 34,
                  fontSize: 12,
                }}
              >
                <TrashIcon />
                <span>Delete ({selectedObjectCount})</span>
              </button>
            ) : null}

            {children}
          </div>
        </>
      )}
    </aside>
  );
}
