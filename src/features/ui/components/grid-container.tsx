"use client";

import { cn } from "@/features/ui/lib/cn";
import { GridContainerCells } from "@/features/ui/components/grid-container/grid-container-cells";
import { GridContainerHeader } from "@/features/ui/components/grid-container/grid-container-header";
import type { GridContainerProps } from "@/features/ui/components/grid-container/types";
import { useGridContainerState } from "@/features/ui/components/grid-container/use-grid-container-state";

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
  const state = useGridContainerState({
    rows,
    cols,
    minRows,
    maxRows,
    minCols,
    maxCols,
    cellColors,
    sectionTitles,
    sectionNotes,
    containerTitle,
    defaultColor,
    chromeTone,
    containerColor,
    onCellColorChange,
    onContainerTitleChange,
    onSectionTitleChange,
    onSectionNoteChange,
    onGridDimensionsChange,
  });

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col rounded-2xl p-4 shadow-sm",
        className,
      )}
      style={{
        backgroundColor: containerColor ?? "rgba(255,255,255,0.8)",
        border: state.isDarkChrome
          ? "1px solid rgba(148, 163, 184, 0.46)"
          : "1px solid rgba(51, 65, 85, 0.28)",
      }}
    >
      <GridContainerHeader
        isEditingContainerTitle={state.isEditingContainerTitle}
        onContainerTitleChange={state.onContainerTitleChange}
        containerTitleDraft={state.containerTitleDraft}
        setContainerTitleDraft={state.setContainerTitleDraft}
        commitContainerTitle={state.commitContainerTitle}
        resolvedTitle={state.resolvedTitle}
        setIsEditingContainerTitle={state.setIsEditingContainerTitle}
        showGridControls={showGridControls}
        safeRows={state.safeRows}
        safeCols={state.safeCols}
        safeMinRows={state.safeMinRows}
        safeMaxRows={state.safeMaxRows}
        safeMinCols={state.safeMinCols}
        safeMaxCols={state.safeMaxCols}
        previewRows={state.previewRows}
        previewCols={state.previewCols}
        isDimensionPickerOpen={state.isDimensionPickerOpen}
        isDimensionDragSelecting={state.isDimensionDragSelecting}
        setIsDimensionPickerOpen={state.setIsDimensionPickerOpen}
        setIsDimensionDragSelecting={state.setIsDimensionDragSelecting}
        setDimensionPreview={state.setDimensionPreview}
        commitGridDimensions={state.commitGridDimensions}
        onGridDimensionsChange={state.onGridDimensionsChange}
        dimensionTriggerRef={state.dimensionTriggerRef}
        dimensionPickerRef={state.dimensionPickerRef}
        sectionBodyTextColor={sectionBodyTextColor}
        sectionTitleTextColor={sectionTitleTextColor}
        containerTitleTextColor={containerTitleTextColor}
      />

      <GridContainerCells
        safeRows={state.safeRows}
        safeCols={state.safeCols}
        gap={gap}
        cellCount={state.cellCount}
        cellClassName={cellClassName}
        minCellHeight={minCellHeight}
        isDarkChrome={state.isDarkChrome}
        showCellColorPickers={showCellColorPickers}
        onCellColorChange={onCellColorChange}
        handleColorChange={state.handleColorChange}
        resolvedColors={state.resolvedColors}
        defaultColor={state.defaultColor}
        containerColor={state.containerColor}
        resolvedSectionTitles={state.resolvedSectionTitles}
        resolvedSectionNotes={state.resolvedSectionNotes}
        editingSectionIndex={state.editingSectionIndex}
        onSectionTitleChange={state.onSectionTitleChange}
        sectionTitleDrafts={state.sectionTitleDrafts}
        setSectionTitleDrafts={state.setSectionTitleDrafts}
        commitSectionTitle={state.commitSectionTitle}
        setEditingSectionIndex={state.setEditingSectionIndex}
        sectionTitleTextColor={sectionTitleTextColor}
        sectionBodyTextColor={sectionBodyTextColor}
        showSectionStickyNotes={showSectionStickyNotes}
        handleSectionNoteChange={state.handleSectionNoteChange}
        stickyPlaceholder={stickyPlaceholder}
        renderCellContent={renderCellContent}
      />
    </div>
  );
}

export type { GridContainerProps };
