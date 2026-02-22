"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

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
  "#e2e8f0",
] as const;

type GridContainerProps = {
  rows: number;
  cols: number;
  gap?: number;
  minCellHeight?: number;
  className?: string;
  cellClassName?: string;
  containerColor?: string;
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
  chromeTone?: "light" | "dark";
  sectionTitleTextColor?: string;
  sectionBodyTextColor?: string;
  containerTitleTextColor?: string;
};

function PencilEditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M3 11.8 3.6 9.3l6.8-6.8a1.2 1.2 0 0 1 1.7 0l1.4 1.4a1.2 1.2 0 0 1 0 1.7L6.7 12.4 4.2 13z"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M8.8 3.9 12.1 7.2"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(12, Math.max(1, Math.floor(value)));
}

function clampGridDimension(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, clampDimension(value)));
}

function defaultSectionTitle(index: number): string {
  return `Section ${index + 1}`;
}

function resolveValues(
  preferred: string[] | undefined,
  fallback: string[],
  cellCount: number,
): string[] {
  return Array.from(
    { length: cellCount },
    (_, index) => preferred?.[index] ?? fallback[index] ?? "",
  );
}

export function GridContainer({
  rows,
  cols,
  gap = 2,
  minCellHeight = 120,
  className,
  cellClassName,
  containerColor,
  containerTitle,
  showCellColorPickers = true,
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
  renderCellContent,
  chromeTone = "light",
  sectionTitleTextColor = "var(--text)",
  sectionBodyTextColor = "var(--text-muted)",
  containerTitleTextColor = "var(--text)",
}: GridContainerProps) {
  const safeMinRows = clampDimension(minRows);
  const safeMaxRows = Math.max(safeMinRows, clampDimension(maxRows));
  const safeMinCols = clampDimension(minCols);
  const safeMaxCols = Math.max(safeMinCols, clampDimension(maxCols));
  const safeRows = clampGridDimension(rows, safeMinRows, safeMaxRows);
  const safeCols = clampGridDimension(cols, safeMinCols, safeMaxCols);
  const cellCount = safeRows * safeCols;
  const fallbackTitles = useMemo(
    () =>
      Array.from({ length: cellCount }, (_, index) =>
        defaultSectionTitle(index),
      ),
    [cellCount],
  );
  const fallbackNotes = useMemo(
    () => Array.from({ length: cellCount }, () => ""),
    [cellCount],
  );

  const [internalColors, setInternalColors] = useState<string[]>(() =>
    Array.from(
      { length: cellCount },
      (_, index) => cellColors?.[index] ?? defaultColor,
    ),
  );
  const [internalContainerTitle, setInternalContainerTitle] = useState(
    containerTitle ?? "",
  );
  const [internalSectionTitles, setInternalSectionTitles] = useState<string[]>(
    () => resolveValues(sectionTitles, fallbackTitles, cellCount),
  );
  const [internalSectionNotes, setInternalSectionNotes] = useState<string[]>(
    () => resolveValues(sectionNotes, fallbackNotes, cellCount),
  );

  const [isEditingContainerTitle, setIsEditingContainerTitle] = useState(false);
  const [containerTitleDraft, setContainerTitleDraft] = useState(
    containerTitle ?? internalContainerTitle,
  );
  const [editingSectionIndex, setEditingSectionIndex] = useState<number | null>(
    null,
  );
  const [sectionTitleDrafts, setSectionTitleDrafts] = useState<string[]>(() =>
    resolveValues(sectionTitles, fallbackTitles, cellCount),
  );
  const [isDimensionPickerOpen, setIsDimensionPickerOpen] = useState(false);
  const [isDimensionDragSelecting, setIsDimensionDragSelecting] =
    useState(false);
  const [dimensionPreview, setDimensionPreview] = useState(() => ({
    rows: safeRows,
    cols: safeCols,
  }));
  const dimensionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dimensionPickerRef = useRef<HTMLDivElement | null>(null);
  const dimensionPreviewRef = useRef(dimensionPreview);
  const previewRows = isDimensionPickerOpen ? dimensionPreview.rows : safeRows;
  const previewCols = isDimensionPickerOpen ? dimensionPreview.cols : safeCols;

  const resolvedTitle = (containerTitle ?? internalContainerTitle).trim();
  const resolvedColors = Array.from(
    { length: cellCount },
    (_, index) => cellColors?.[index] ?? internalColors[index] ?? defaultColor,
  );
  const resolvedSectionTitles = resolveValues(
    sectionTitles,
    internalSectionTitles.length > 0 ? internalSectionTitles : fallbackTitles,
    cellCount,
  );
  const resolvedSectionNotes = resolveValues(
    sectionNotes,
    internalSectionNotes.length > 0 ? internalSectionNotes : fallbackNotes,
    cellCount,
  );
  const isDarkChrome = chromeTone === "dark";
    const commitGridDimensions = useCallback(
    (nextRows: number, nextCols: number) => {
      if (!onGridDimensionsChange) {
        return;
      }

      const boundedRows = clampGridDimension(
        nextRows,
        safeMinRows,
        safeMaxRows,
      );
      const boundedCols = clampGridDimension(
        nextCols,
        safeMinCols,
        safeMaxCols,
      );
      setDimensionPreview({
        rows: boundedRows,
        cols: boundedCols,
      });

      if (boundedRows === safeRows && boundedCols === safeCols) {
        return;
      }

      onGridDimensionsChange(boundedRows, boundedCols);
    },
    [
      onGridDimensionsChange,
      safeCols,
      safeMaxCols,
      safeMaxRows,
      safeMinCols,
      safeMinRows,
      safeRows,
    ],
  );

  useEffect(() => {
    dimensionPreviewRef.current = dimensionPreview;
  }, [dimensionPreview]);

  useEffect(() => {
    if (!isDimensionPickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const targetNode = event.target as Node | null;
      if (!targetNode) {
        return;
      }

      if (
        dimensionPickerRef.current?.contains(targetNode) ||
        dimensionTriggerRef.current?.contains(targetNode)
      ) {
        return;
      }

      setIsDimensionPickerOpen(false);
      setIsDimensionDragSelecting(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isDimensionPickerOpen]);

  useEffect(() => {
    if (!isDimensionDragSelecting) {
      return;
    }

    const handlePointerUp = () => {
      setIsDimensionDragSelecting(false);
      setIsDimensionPickerOpen(false);
      const preview = dimensionPreviewRef.current;
      commitGridDimensions(preview.rows, preview.cols);
    };

    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [commitGridDimensions, isDimensionDragSelecting]);

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
    const nextTitle = containerTitleDraft.trim().slice(0, 120);
    if (!containerTitle) {
      setInternalContainerTitle(nextTitle);
    }
    onContainerTitleChange?.(nextTitle);
    setContainerTitleDraft(nextTitle);
    setIsEditingContainerTitle(false);
  };

    const commitSectionTitle = (cellIndex: number) => {
    const nextTitle =
      (sectionTitleDrafts[cellIndex] ?? "").trim() ||
      defaultSectionTitle(cellIndex);
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
        "flex h-full min-h-0 flex-col rounded-2xl p-4 shadow-sm",
        className,
      )}
      style={{
        backgroundColor: containerColor ?? "rgba(255,255,255,0.8)",
        border: isDarkChrome
          ? "1px solid rgba(148, 163, 184, 0.46)"
          : "1px solid rgba(51, 65, 85, 0.28)",
      }}
    >
      <div className="mb-3">
        <div className="relative min-h-8">
          {isEditingContainerTitle && onContainerTitleChange ? (
            <input
              value={containerTitleDraft}
              onPointerDown={(event) => event.stopPropagation()}
              onChange={(event) => setContainerTitleDraft(event.target.value)}
              onBlur={commitContainerTitle}
              placeholder="Container title"
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
              className="mx-auto block w-full max-w-[360px] rounded-md px-2 py-1 text-center text-sm font-semibold"
              style={{
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: containerTitleTextColor,
              }}
            />
          ) : null}
          {!isEditingContainerTitle ? (
            <div className="mx-auto flex min-h-7 w-fit max-w-[70%] items-center justify-center gap-1.5">
              {onContainerTitleChange ? (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => {
                    setContainerTitleDraft(resolvedTitle);
                    setIsEditingContainerTitle(true);
                  }}
                  title={
                    resolvedTitle.length > 0
                      ? "Rename container title"
                      : "Add container title"
                  }
                  aria-label={
                    resolvedTitle.length > 0
                      ? "Rename container title"
                      : "Add container title"
                  }
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
              <h3
                className="m-0 truncate text-center text-sm font-semibold"
                style={{ color: containerTitleTextColor }}
              >
                {resolvedTitle.length > 0 ? resolvedTitle : "Add title"}
              </h3>
            </div>
          ) : null}

          {showGridControls && onGridDimensionsChange ? (
            <div
              className="absolute right-0 top-0 z-20 flex items-center gap-2 text-[11px]"
              style={{ color: sectionBodyTextColor }}
            >
              <span
                className="hidden text-[11px] font-medium sm:inline"
                style={{ color: sectionBodyTextColor }}
              >
                Rows {previewRows} x Cols {previewCols}
              </span>
              <button
                ref={dimensionTriggerRef}
                type="button"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  setDimensionPreview({
                    rows: safeRows,
                    cols: safeCols,
                  });
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
                  style={{
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                  }}
                >
                  <div
                    className="mb-2 text-[11px] font-semibold"
                    style={{ color: sectionBodyTextColor }}
                  >
                    Drag to resize: {previewRows} x {previewCols}
                  </div>
                  <div
                    className="grid gap-1"
                    style={{
                      gridTemplateColumns: `repeat(${safeMaxCols}, minmax(0, 1fr))`,
                    }}
                  >
                    {Array.from({ length: safeMaxRows * safeMaxCols }).map(
                      (_, index) => {
                        const cellRow = Math.floor(index / safeMaxCols) + 1;
                        const cellCol = (index % safeMaxCols) + 1;
                        const isEnabled =
                          cellRow >= safeMinRows && cellCol >= safeMinCols;
                        const isSelectedArea =
                          cellRow <= previewRows && cellCol <= previewCols;

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
                              setDimensionPreview({
                                rows: cellRow,
                                cols: cellCol,
                              });
                            }}
                            onPointerEnter={() => {
                              if (!isDimensionDragSelecting || !isEnabled) {
                                return;
                              }
                              setDimensionPreview({
                                rows: cellRow,
                                cols: cellCol,
                              });
                            }}
                            onKeyDown={(event) => {
                              if (!isEnabled) {
                                return;
                              }
                              if (
                                event.key === "Enter" ||
                                event.key === " "
                              ) {
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
                              isEnabled && isSelectedArea
                                ? "bg-sky-400/70"
                                : "",
                              isEnabled && !isSelectedArea
                                ? "bg-slate-100 hover:bg-slate-200"
                                : "",
                            )}
                          />
                        );
                      },
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${safeCols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${safeRows}, minmax(0, 1fr))`,
          gap,
        }}
      >
        {Array.from({ length: cellCount }).map((_, cellIndex) => {
          const cellTitle =
            resolvedSectionTitles[cellIndex] ?? defaultSectionTitle(cellIndex);
          const cellNote = resolvedSectionNotes[cellIndex] ?? "";
          const isEditingSection = editingSectionIndex === cellIndex;
          const rawCellColor = resolvedColors[cellIndex] ?? defaultColor;
          const isTransparentCell =
            rawCellColor.toLowerCase() === "transparent";
          const effectiveCellColor = isTransparentCell
            ? containerColor ?? defaultColor
            : rawCellColor;
          const selectedSwatchColor = effectiveCellColor.toLowerCase();

          return (
            <div
              key={cellIndex}
              className={cn(
                "relative flex h-full min-h-0 flex-col rounded-xl p-3 shadow-inner transition-colors",
                cellClassName,
              )}
              style={{
                background: isTransparentCell
                  ? effectiveCellColor
                  : rawCellColor,
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
                      const isSelected =
                        selectedSwatchColor === swatch.toLowerCase();
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
                            isSelected
                              ? "border-slate-800 ring-1 ring-slate-500"
                              : "border-slate-400",
                            !onCellColorChange
                              ? "cursor-not-allowed opacity-65"
                              : "cursor-pointer",
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
                            setSectionTitleDrafts((current) => {
                              const next = [...current];
                              next[cellIndex] = cellTitle;
                              return next;
                            });
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
                    onChange={(event) =>
                      handleSectionNoteChange(cellIndex, event.target.value)
                    }
                    className="min-h-[72px] w-full resize-none border-none bg-transparent p-0 text-sm outline-none"
                    style={{ color: sectionTitleTextColor }}
                    placeholder={stickyPlaceholder}
                  />
                </div>
              ) : null}

              {renderCellContent ? (
                <div
                  className={cn(
                    "min-h-0 flex-1 text-sm",
                    showSectionStickyNotes ? "mt-2" : "",
                  )}
                  style={{ color: sectionBodyTextColor }}
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
