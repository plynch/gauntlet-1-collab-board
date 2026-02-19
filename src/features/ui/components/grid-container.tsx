"use client";

import { useMemo, useState, type ReactNode } from "react";

import { cn } from "@/features/ui/lib/cn";

export const GRID_SWATCHES = [
  "transparent",
  "#fef3c7",
  "#fed7aa",
  "#fecaca",
  "#fbcfe8",
  "#ddd6fe",
  "#bfdbfe",
  "#a7f3d0",
  "#d1fae5",
  "#e2e8f0"
] as const;

type GridContainerProps = {
  rows: number;
  cols: number;
  gap?: number;
  minCellHeight?: number;
  className?: string;
  cellClassName?: string;
  containerTitle?: string;
  showCellColorPickers?: boolean;
  cellColors?: string[];
  sectionTitles?: string[];
  sectionNotes?: string[];
  defaultColor?: string;
  showSectionStickyNotes?: boolean;
  stickyPlaceholder?: string;
  onCellColorChange?: (cellIndex: number, color: string) => void;
  onContainerTitleChange?: (nextTitle: string) => void;
  onSectionTitleChange?: (cellIndex: number, nextTitle: string) => void;
  onSectionNoteChange?: (cellIndex: number, nextNote: string) => void;
  onGridDimensionsChange?: (nextRows: number, nextCols: number) => void;
  showGridControls?: boolean;
  minRows?: number;
  maxRows?: number;
  minCols?: number;
  maxCols?: number;
  renderCellContent?: (cellIndex: number) => ReactNode;
};

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(12, Math.max(1, Math.floor(value)));
}

function defaultSectionTitle(index: number): string {
  return `Section ${index + 1}`;
}

function resolveValues(
  preferred: string[] | undefined,
  fallback: string[],
  cellCount: number
): string[] {
  return Array.from({ length: cellCount }, (_, index) => preferred?.[index] ?? fallback[index] ?? "");
}

export function GridContainer({
  rows,
  cols,
  gap = 2,
  minCellHeight = 120,
  className,
  cellClassName,
  containerTitle,
  showCellColorPickers = false,
  cellColors,
  sectionTitles,
  sectionNotes,
  defaultColor = "#f8fafc",
  showSectionStickyNotes = false,
  stickyPlaceholder = "New sticky note",
  onCellColorChange,
  onContainerTitleChange,
  onSectionTitleChange,
  onSectionNoteChange,
  onGridDimensionsChange,
  showGridControls = false,
  minRows = 1,
  maxRows = 6,
  minCols = 1,
  maxCols = 6,
  renderCellContent
}: GridContainerProps) {
  const safeRows = clampDimension(rows);
  const safeCols = clampDimension(cols);
  const cellCount = safeRows * safeCols;
  const fallbackTitles = useMemo(
    () => Array.from({ length: cellCount }, (_, index) => defaultSectionTitle(index)),
    [cellCount]
  );
  const fallbackNotes = useMemo(() => Array.from({ length: cellCount }, () => ""), [cellCount]);

  const [internalColors, setInternalColors] = useState<string[]>(() =>
    Array.from({ length: cellCount }, (_, index) => cellColors?.[index] ?? defaultColor)
  );
  const [internalContainerTitle, setInternalContainerTitle] = useState(
    containerTitle ?? "Grid Container"
  );
  const [internalSectionTitles, setInternalSectionTitles] = useState<string[]>(() =>
    resolveValues(sectionTitles, fallbackTitles, cellCount)
  );
  const [internalSectionNotes, setInternalSectionNotes] = useState<string[]>(() =>
    resolveValues(sectionNotes, fallbackNotes, cellCount)
  );

  const [isEditingContainerTitle, setIsEditingContainerTitle] = useState(false);
  const [containerTitleDraft, setContainerTitleDraft] = useState(
    containerTitle ?? internalContainerTitle
  );
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(null);
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<string[]>(() =>
    resolveValues(sectionTitles, fallbackTitles, cellCount)
  );

  const resolvedTitle = (containerTitle ?? internalContainerTitle).trim() || "Grid Container";
  const resolvedColors = Array.from(
    { length: cellCount },
    (_, index) => cellColors?.[index] ?? internalColors[index] ?? defaultColor
  );
  const resolvedSectionTitles = resolveValues(
    sectionTitles,
    internalSectionTitles.length > 0 ? internalSectionTitles : fallbackTitles,
    cellCount
  );
  const resolvedSectionNotes = resolveValues(
    sectionNotes,
    internalSectionNotes.length > 0 ? internalSectionNotes : fallbackNotes,
    cellCount
  );
  const rowOptions = Array.from(
    { length: Math.max(1, maxRows - minRows + 1) },
    (_, index) => minRows + index
  );
  const colOptions = Array.from(
    { length: Math.max(1, maxCols - minCols + 1) },
    (_, index) => minCols + index
  );

  const handleColorChange = (cellIndex: number, color: string) => {
    if (!cellColors) {
      setInternalColors((current) => {
        const next = [...current];
        next[cellIndex] = color;
        return next;
      });
    }

    onCellColorChange?.(cellIndex, color);
  };

  const commitContainerTitle = () => {
    const nextTitle = containerTitleDraft.trim() || "Grid Container";
    if (!containerTitle) {
      setInternalContainerTitle(nextTitle);
    }
    onContainerTitleChange?.(nextTitle);
    setContainerTitleDraft(nextTitle);
    setIsEditingContainerTitle(false);
  };

  const commitSectionTitle = (cellIndex: number) => {
    const nextTitle = (sectionTitleDrafts[cellIndex] ?? "").trim() || defaultSectionTitle(cellIndex);
    if (!sectionTitles) {
      setInternalSectionTitles((current) => {
        const next = [...current];
        next[cellIndex] = nextTitle;
        return next;
      });
    }
    onSectionTitleChange?.(cellIndex, nextTitle);
    setSectionTitleDrafts((current) => {
      const next = [...current];
      next[cellIndex] = nextTitle;
      return next;
    });
    setEditingSectionIndex(null);
  };

  const handleSectionNoteChange = (cellIndex: number, nextNote: string) => {
    if (!sectionNotes) {
      setInternalSectionNotes((current) => {
        const next = [...current];
        next[cellIndex] = nextNote;
        return next;
      });
    }

    onSectionNoteChange?.(cellIndex, nextNote);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm",
        className
      )}
    >
      <div className="mb-3 grid gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {isEditingContainerTitle && onContainerTitleChange ? (
            <input
              value={containerTitleDraft}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setContainerTitleDraft(event.target.value)}
              onBlur={commitContainerTitle}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitContainerTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setContainerTitleDraft(resolvedTitle);
                  setIsEditingContainerTitle(false);
                }
              }}
              autoFocus
              className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900"
            />
          ) : (
            <h3 className="m-0 truncate text-sm font-semibold text-slate-800">{resolvedTitle}</h3>
          )}
          {onContainerTitleChange && !isEditingContainerTitle ? (
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => {
                setContainerTitleDraft(resolvedTitle);
                setIsEditingContainerTitle(true);
              }}
              title="Rename container title"
              aria-label="Rename container title"
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            >
              <span aria-hidden="true">✎</span>
            </button>
          ) : null}
        </div>

        {showGridControls && onGridDimensionsChange ? (
          <div className="flex items-center justify-end gap-2 text-[11px] text-slate-700">
            <label className="inline-flex items-center gap-1">
              <span>Rows</span>
              <select
                value={safeRows}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const nextRows = Number(event.target.value);
                  if (Number.isFinite(nextRows)) {
                    onGridDimensionsChange(nextRows, safeCols);
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800"
              >
                {rowOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-flex items-center gap-1">
              <span>Cols</span>
              <select
                value={safeCols}
                onPointerDown={(event) => event.stopPropagation()}
                onChange={(event) => {
                  const nextCols = Number(event.target.value);
                  if (Number.isFinite(nextCols)) {
                    onGridDimensionsChange(safeRows, nextCols);
                  }
                }}
                className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] font-medium text-slate-800"
              >
                {colOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${safeRows}, minmax(0, 1fr))`,
          gap
        }}
      >
        {Array.from({ length: cellCount }).map((_, cellIndex) => {
          const cellTitle = resolvedSectionTitles[cellIndex] ?? defaultSectionTitle(cellIndex);
          const cellNote = resolvedSectionNotes[cellIndex] ?? "";
          const isEditingSection = editingSectionIndex === cellIndex;
          const cellColor = resolvedColors[cellIndex] ?? defaultColor;
          const isTransparentCell = cellColor.toLowerCase() === "transparent";

          return (
            <div
              key={cellIndex}
              className={cn(
                "relative flex h-full min-h-0 flex-col rounded-xl border border-slate-300 p-3 shadow-inner transition-colors",
                cellClassName
              )}
              style={{
                background: isTransparentCell ? "transparent" : cellColor,
                minHeight: minCellHeight
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  {isEditingSection && onSectionTitleChange ? (
                    <input
                      value={sectionTitleDrafts[cellIndex] ?? cellTitle}
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={(event) => {
                        const nextDrafts = [...sectionTitleDrafts];
                        nextDrafts[cellIndex] = event.target.value;
                        setSectionTitleDrafts(nextDrafts);
                      }}
                      onBlur={() => commitSectionTitle(cellIndex)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitSectionTitle(cellIndex);
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          setSectionTitleDrafts((current) => {
                            const next = [...current];
                            next[cellIndex] = cellTitle;
                            return next;
                          });
                          setEditingSectionIndex(null);
                        }
                      }}
                      autoFocus
                      className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm font-semibold text-slate-900"
                    />
                  ) : (
                    <strong className="truncate text-sm font-semibold text-slate-800">{cellTitle}</strong>
                  )}
                  {onSectionTitleChange && !isEditingSection ? (
                    <button
                      type="button"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() => {
                        setSectionTitleDrafts((current) => {
                          const next = [...current];
                          next[cellIndex] = cellTitle;
                          return next;
                        });
                        setEditingSectionIndex(cellIndex);
                      }}
                      title="Rename section title"
                      aria-label="Rename section title"
                      className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <span aria-hidden="true">✎</span>
                    </button>
                  ) : null}
                </div>

                {showCellColorPickers ? (
                  <div className="ml-auto flex max-w-[124px] items-center gap-1 overflow-x-auto pl-1">
                    {GRID_SWATCHES.map((swatch) => {
                      const isSelected =
                        resolvedColors[cellIndex]?.toLowerCase() === swatch.toLowerCase();
                      const isTransparent = swatch === "transparent";
                      return (
                        <button
                          key={`${cellIndex}-${swatch}`}
                          type="button"
                          aria-label={`Set cell ${cellIndex + 1} color`}
                          title={isTransparent ? "Transparent" : swatch}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={() => handleColorChange(cellIndex, swatch)}
                          className={cn(
                            "h-4 w-4 shrink-0 rounded-full border",
                            isSelected ? "border-slate-800 ring-1 ring-slate-500" : "border-slate-400"
                          )}
                          style={{
                            background: isTransparent
                              ? "repeating-conic-gradient(#94a3b8 0% 25%, #e2e8f0 0% 50%) 50% / 8px 8px"
                              : swatch
                          }}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </div>

              {showSectionStickyNotes ? (
                <div className="rounded-lg border border-amber-300 bg-amber-100/95 p-2 shadow-sm">
                  <textarea
                    value={cellNote}
                    onPointerDown={(event) => event.stopPropagation()}
                    onChange={(event) => handleSectionNoteChange(cellIndex, event.target.value)}
                    className="min-h-[72px] w-full resize-none border-none bg-transparent p-0 text-sm text-slate-800 outline-none placeholder:text-slate-500"
                    placeholder={stickyPlaceholder}
                  />
                </div>
              ) : null}

              {renderCellContent ? (
                <div
                  className={cn(
                    "min-h-0 flex-1",
                    showSectionStickyNotes ? "mt-2 text-sm text-slate-700" : "text-sm text-slate-700"
                  )}
                >
                  {renderCellContent(cellIndex)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
