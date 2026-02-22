import type { RefObject } from "react";

import { cn } from "@/features/ui/lib/cn";

type DimensionPreview = {
  rows: number;
  cols: number;
};

type Setter<T> = (value: T | ((current: T) => T)) => void;

type GridDimensionPickerProps = {
  showGridControls: boolean;
  onGridDimensionsChange?: (nextRows: number, nextCols: number) => void;
  safeRows: number;
  safeCols: number;
  safeMinRows: number;
  safeMaxRows: number;
  safeMinCols: number;
  safeMaxCols: number;
  previewRows: number;
  previewCols: number;
  isDimensionPickerOpen: boolean;
  isDimensionDragSelecting: boolean;
  setIsDimensionPickerOpen: Setter<boolean>;
  setIsDimensionDragSelecting: Setter<boolean>;
  setDimensionPreview: Setter<DimensionPreview>;
  commitGridDimensions: (nextRows: number, nextCols: number) => void;
  dimensionTriggerRef: RefObject<HTMLButtonElement | null>;
  dimensionPickerRef: RefObject<HTMLDivElement | null>;
  sectionBodyTextColor: string;
  sectionTitleTextColor: string;
};

export function GridDimensionPicker({
  showGridControls,
  onGridDimensionsChange,
  safeRows,
  safeCols,
  safeMinRows,
  safeMaxRows,
  safeMinCols,
  safeMaxCols,
  previewRows,
  previewCols,
  isDimensionPickerOpen,
  isDimensionDragSelecting,
  setIsDimensionPickerOpen,
  setIsDimensionDragSelecting,
  setDimensionPreview,
  commitGridDimensions,
  dimensionTriggerRef,
  dimensionPickerRef,
  sectionBodyTextColor,
  sectionTitleTextColor,
}: GridDimensionPickerProps) {
  if (!showGridControls || !onGridDimensionsChange) {
    return null;
  }

  return (
    <div
      className="absolute right-0 top-0 z-20 flex items-center gap-2 text-[11px]"
      style={{ color: sectionBodyTextColor }}
    >
      <span className="hidden text-[11px] font-medium sm:inline" style={{ color: sectionBodyTextColor }}>
        Rows {previewRows} x Cols {previewCols}
      </span>
      <button
        ref={dimensionTriggerRef}
        type="button"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => {
          setDimensionPreview({ rows: safeRows, cols: safeCols });
          setIsDimensionPickerOpen((current) => !current);
        }}
        aria-label="Change grid rows and columns"
        title="Change grid rows and columns"
        className="inline-flex h-7 items-center justify-center rounded-md px-2 text-[11px] font-semibold"
        style={{
          border: "1px solid var(--border)",
          background: "var(--surface)",
          color: sectionTitleTextColor,
        }}
      >
        <span className="tabular-nums">
          {safeRows} x {safeCols}
        </span>
      </button>
      {isDimensionPickerOpen ? (
        <div
          ref={dimensionPickerRef}
          onPointerDown={(event) => event.stopPropagation()}
          className="absolute right-0 top-8 w-[170px] rounded-lg p-2 shadow-lg backdrop-blur"
          style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
        >
          <div className="mb-2 text-[11px] font-semibold" style={{ color: sectionBodyTextColor }}>
            Drag to resize: {previewRows} x {previewCols}
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${safeMaxCols}, minmax(0, 1fr))` }}>
            {Array.from({ length: safeMaxRows * safeMaxCols }).map((_, index) => {
              const cellRow = Math.floor(index / safeMaxCols) + 1;
              const cellCol = (index % safeMaxCols) + 1;
              const isEnabled = cellRow >= safeMinRows && cellCol >= safeMinCols;
              const isSelectedArea = cellRow <= previewRows && cellCol <= previewCols;

              return (
                <button
                  key={`grid-picker-${cellRow}-${cellCol}`}
                  type="button"
                  aria-label={`Select ${cellRow} rows and ${cellCol} columns`}
                  disabled={!isEnabled}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    if (!isEnabled) {
                      return;
                    }
                    setIsDimensionDragSelecting(true);
                    setDimensionPreview({ rows: cellRow, cols: cellCol });
                  }}
                  onPointerEnter={() => {
                    if (!isDimensionDragSelecting || !isEnabled) {
                      return;
                    }
                    setDimensionPreview({ rows: cellRow, cols: cellCol });
                  }}
                  onKeyDown={(event) => {
                    if (!isEnabled) {
                      return;
                    }
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      commitGridDimensions(cellRow, cellCol);
                      setIsDimensionPickerOpen(false);
                    }
                  }}
                  className={cn(
                    "h-4 w-4 rounded-[3px] border transition-colors",
                    isEnabled
                      ? "border-slate-300"
                      : "cursor-not-allowed border-slate-200 bg-slate-100 opacity-70",
                    isEnabled && isSelectedArea ? "bg-sky-400/70" : "",
                    isEnabled && !isSelectedArea ? "bg-slate-100 hover:bg-slate-200" : "",
                  )}
                />
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
