import type { ReactNode } from "react";

import { cn } from "@/features/ui/lib/cn";
import { GRID_SWATCHES } from "@/features/ui/components/grid-container/constants";
import { PencilEditIcon } from "@/features/ui/components/grid-container/pencil-edit-icon";

type GridCellProps = {
  cellIndex: number;
  cellClassName?: string;
  minCellHeight: number;
  isDarkChrome: boolean;
  showCellColorPickers: boolean;
  onCellColorChange?: (cellIndex: number, color: string) => void;
  handleColorChange: (cellIndex: number, color: string) => void;
  rawCellColor: string;
  isTransparentCell: boolean;
  effectiveCellColor: string;
  selectedSwatchColor: string;
  cellTitle: string;
  isEditingSection: boolean;
  onSectionTitleChange?: (cellIndex: number, nextTitle: string) => void;
  sectionTitleDraft: string;
  setSectionTitleDraft: (nextValue: string) => void;
  commitSectionTitle: (cellIndex: number) => void;
  setEditingSectionIndex: (nextIndex: number | null) => void;
  sectionTitleTextColor: string;
  sectionBodyTextColor: string;
  showSectionStickyNotes: boolean;
  cellNote: string;
  handleSectionNoteChange: (cellIndex: number, nextNote: string) => void;
  stickyPlaceholder: string;
  renderCellContent?: (cellIndex: number) => ReactNode;
};

export function GridCell({
  cellIndex,
  cellClassName,
  minCellHeight,
  isDarkChrome,
  showCellColorPickers,
  onCellColorChange,
  handleColorChange,
  rawCellColor,
  isTransparentCell,
  effectiveCellColor,
  selectedSwatchColor,
  cellTitle,
  isEditingSection,
  onSectionTitleChange,
  sectionTitleDraft,
  setSectionTitleDraft,
  commitSectionTitle,
  setEditingSectionIndex,
  sectionTitleTextColor,
  sectionBodyTextColor,
  showSectionStickyNotes,
  cellNote,
  handleSectionNoteChange,
  stickyPlaceholder,
  renderCellContent,
}: GridCellProps) {
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 flex-col rounded-xl p-3 shadow-inner transition-colors",
        cellClassName,
      )}
      style={{
        background: isTransparentCell ? effectiveCellColor : rawCellColor,
        minHeight: minCellHeight,
        border: isDarkChrome
          ? "1px solid rgba(148, 163, 184, 0.5)"
          : "1px solid rgba(51, 65, 85, 0.35)",
      }}
    >
      <div className="relative mb-2 min-h-12">
        {showCellColorPickers ? (
          <div className="absolute right-0 top-0 flex flex-nowrap gap-1 pl-2">
            {GRID_SWATCHES.map((swatch) => {
              const isSelected = selectedSwatchColor === swatch.toLowerCase();
              const isTransparent = swatch === "transparent";
              return (
                <button
                  key={`${cellIndex}-${swatch}`}
                  type="button"
                  aria-label={`Set cell ${cellIndex + 1} color`}
                  title={isTransparent ? "Transparent" : swatch}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleColorChange(cellIndex, swatch);
                  }}
                  disabled={!onCellColorChange}
                  className={cn(
                    "h-4 w-4 rounded-full border",
                    isSelected ? "border-slate-800 ring-1 ring-slate-500" : "border-slate-400",
                    !onCellColorChange ? "cursor-not-allowed opacity-65" : "cursor-pointer",
                  )}
                  style={{
                    background: isTransparent
                      ? "repeating-conic-gradient(#94a3b8 0% 25%, #e2e8f0 0% 50%) 50% / 8px 8px"
                      : swatch,
                  }}
                />
              );
            })}
          </div>
        ) : null}
        <div className="relative flex min-h-6 items-center justify-center pr-[108px]">
          {isEditingSection && onSectionTitleChange ? (
            <input
              value={sectionTitleDraft}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setSectionTitleDraft(event.target.value)}
              onBlur={() => commitSectionTitle(cellIndex)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitSectionTitle(cellIndex);
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSectionTitleDraft(cellTitle);
                  setEditingSectionIndex(null);
                }
              }}
              autoFocus
              className="w-full max-w-[280px] rounded-md px-2 py-1 text-center text-sm font-semibold"
              style={{
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: sectionTitleTextColor,
              }}
            />
          ) : (
            <div className="mx-auto flex min-h-6 w-fit max-w-full items-center justify-center gap-1.5">
              {onSectionTitleChange ? (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setSectionTitleDraft(cellTitle);
                    setEditingSectionIndex(cellIndex);
                  }}
                  title="Rename section title"
                  aria-label="Rename section title"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    color: sectionBodyTextColor,
                  }}
                >
                  <PencilEditIcon />
                </button>
              ) : null}
              <strong
                className="max-w-[220px] truncate text-center text-sm font-semibold"
                style={{ color: sectionTitleTextColor }}
              >
                {cellTitle}
              </strong>
            </div>
          )}
        </div>
      </div>

      {showSectionStickyNotes ? (
        <div
          className="rounded-lg p-2 shadow-sm"
          style={{
            border: isDarkChrome
              ? "1px solid rgba(245, 158, 11, 0.58)"
              : "1px solid rgba(217, 119, 6, 0.52)",
            background: isDarkChrome
              ? "rgba(120, 53, 15, 0.46)"
              : "rgba(254, 243, 199, 0.95)",
          }}
        >
          <textarea
            value={cellNote}
            onPointerDown={(event) => event.stopPropagation()}
            onChange={(event) => handleSectionNoteChange(cellIndex, event.target.value)}
            className="min-h-[72px] w-full resize-none border-none bg-transparent p-0 text-sm outline-none"
            style={{ color: sectionTitleTextColor }}
            placeholder={stickyPlaceholder}
          />
        </div>
      ) : null}

      {renderCellContent ? (
        <div
          className={cn("min-h-0 flex-1 text-sm", showSectionStickyNotes ? "mt-2" : "")}
          style={{ color: sectionBodyTextColor }}
        >
          {renderCellContent(cellIndex)}
        </div>
      ) : null}
    </div>
  );
}
