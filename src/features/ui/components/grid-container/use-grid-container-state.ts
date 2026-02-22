import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { GridContainerProps } from "@/features/ui/components/grid-container/types";
import {
  clampDimension,
  clampGridDimension,
  defaultSectionTitle,
  resolveValues,
} from "@/features/ui/components/grid-container/utils";

type GridContainerStateInput = Pick<
  GridContainerProps,
  | "rows"
  | "cols"
  | "minRows"
  | "maxRows"
  | "minCols"
  | "maxCols"
  | "cellColors"
  | "sectionTitles"
  | "sectionNotes"
  | "containerTitle"
  | "defaultColor"
  | "chromeTone"
  | "containerColor"
  | "onCellColorChange"
  | "onContainerTitleChange"
  | "onSectionTitleChange"
  | "onSectionNoteChange"
  | "onGridDimensionsChange"
>;

export function useGridContainerState({
  rows,
  cols,
  minRows = 1,
  maxRows = 6,
  minCols = 1,
  maxCols = 6,
  cellColors,
  sectionTitles,
  sectionNotes,
  containerTitle,
  defaultColor = "#f8fafc",
  chromeTone = "light",
  containerColor,
  onCellColorChange,
  onContainerTitleChange,
  onSectionTitleChange,
  onSectionNoteChange,
  onGridDimensionsChange,
}: GridContainerStateInput) {
  const safeMinRows = clampDimension(minRows);
  const safeMaxRows = Math.max(safeMinRows, clampDimension(maxRows));
  const safeMinCols = clampDimension(minCols);
  const safeMaxCols = Math.max(safeMinCols, clampDimension(maxCols));
  const safeRows = clampGridDimension(rows, safeMinRows, safeMaxRows);
  const safeCols = clampGridDimension(cols, safeMinCols, safeMaxCols);
  const cellCount = safeRows * safeCols;
  const fallbackTitles = useMemo(
    () =>
      Array.from({ length: cellCount }, (_, index) => defaultSectionTitle(index)),
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
      const boundedRows = clampGridDimension(nextRows, safeMinRows, safeMaxRows);
      const boundedCols = clampGridDimension(nextCols, safeMinCols, safeMaxCols);
      setDimensionPreview({ rows: boundedRows, cols: boundedCols });
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

  return {
    safeMinRows,
    safeMaxRows,
    safeMinCols,
    safeMaxCols,
    safeRows,
    safeCols,
    cellCount,
    isDarkChrome,
    isEditingContainerTitle,
    setIsEditingContainerTitle,
    containerTitleDraft,
    setContainerTitleDraft,
    editingSectionIndex,
    setEditingSectionIndex,
    sectionTitleDrafts,
    setSectionTitleDrafts,
    isDimensionPickerOpen,
    setIsDimensionPickerOpen,
    isDimensionDragSelecting,
    setIsDimensionDragSelecting,
    dimensionPreview,
    setDimensionPreview,
    dimensionTriggerRef,
    dimensionPickerRef,
    previewRows,
    previewCols,
    resolvedTitle,
    resolvedColors,
    resolvedSectionTitles,
    resolvedSectionNotes,
    commitGridDimensions,
    handleColorChange,
    commitContainerTitle,
    commitSectionTitle,
    handleSectionNoteChange,
    defaultColor,
    containerColor,
    onContainerTitleChange,
    onSectionTitleChange,
    onGridDimensionsChange,
  };
}
