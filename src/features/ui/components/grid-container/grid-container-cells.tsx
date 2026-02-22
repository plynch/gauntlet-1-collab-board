import type { Dispatch, ReactNode, SetStateAction } from "react";

import { GridCell } from "@/features/ui/components/grid-container/grid-cell";
import { defaultSectionTitle } from "@/features/ui/components/grid-container/utils";

type GridContainerCellsProps = {
  safeRows: number;
  safeCols: number;
  gap: number;
  cellCount: number;
  cellClassName?: string;
  minCellHeight: number;
  isDarkChrome: boolean;
  showCellColorPickers: boolean;
  onCellColorChange?: (cellIndex: number, color: string) => void;
  handleColorChange: (cellIndex: number, color: string) => void;
  resolvedColors: string[];
  defaultColor: string;
  containerColor?: string;
  resolvedSectionTitles: string[];
  resolvedSectionNotes: string[];
  editingSectionIndex: number | null;
  onSectionTitleChange?: (cellIndex: number, nextTitle: string) => void;
  sectionTitleDrafts: string[];
  setSectionTitleDrafts: Dispatch<SetStateAction<string[]>>;
  commitSectionTitle: (cellIndex: number) => void;
  setEditingSectionIndex: Dispatch<SetStateAction<number | null>>;
  sectionTitleTextColor: string;
  sectionBodyTextColor: string;
  showSectionStickyNotes: boolean;
  handleSectionNoteChange: (cellIndex: number, nextNote: string) => void;
  stickyPlaceholder: string;
  renderCellContent?: (cellIndex: number) => ReactNode;
};

export function GridContainerCells({
  safeRows,
  safeCols,
  gap,
  cellCount,
  cellClassName,
  minCellHeight,
  isDarkChrome,
  showCellColorPickers,
  onCellColorChange,
  handleColorChange,
  resolvedColors,
  defaultColor,
  containerColor,
  resolvedSectionTitles,
  resolvedSectionNotes,
  editingSectionIndex,
  onSectionTitleChange,
  sectionTitleDrafts,
  setSectionTitleDrafts,
  commitSectionTitle,
  setEditingSectionIndex,
  sectionTitleTextColor,
  sectionBodyTextColor,
  showSectionStickyNotes,
  handleSectionNoteChange,
  stickyPlaceholder,
  renderCellContent,
}: GridContainerCellsProps) {
  return (
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
        const isTransparentCell = rawCellColor.toLowerCase() === "transparent";
        const effectiveCellColor = isTransparentCell
          ? containerColor ?? defaultColor
          : rawCellColor;
        const selectedSwatchColor = effectiveCellColor.toLowerCase();

        return (
          <GridCell
            key={cellIndex}
            cellIndex={cellIndex}
            cellClassName={cellClassName}
            minCellHeight={minCellHeight}
            isDarkChrome={isDarkChrome}
            showCellColorPickers={showCellColorPickers}
            onCellColorChange={onCellColorChange}
            handleColorChange={handleColorChange}
            rawCellColor={rawCellColor}
            isTransparentCell={isTransparentCell}
            effectiveCellColor={effectiveCellColor}
            selectedSwatchColor={selectedSwatchColor}
            cellTitle={cellTitle}
            isEditingSection={isEditingSection}
            onSectionTitleChange={onSectionTitleChange}
            sectionTitleDraft={sectionTitleDrafts[cellIndex] ?? cellTitle}
            setSectionTitleDraft={(nextValue) => {
              const nextDrafts = [...sectionTitleDrafts];
              nextDrafts[cellIndex] = nextValue;
              setSectionTitleDrafts(nextDrafts);
            }}
            commitSectionTitle={commitSectionTitle}
            setEditingSectionIndex={setEditingSectionIndex}
            sectionTitleTextColor={sectionTitleTextColor}
            sectionBodyTextColor={sectionBodyTextColor}
            showSectionStickyNotes={showSectionStickyNotes}
            cellNote={cellNote}
            handleSectionNoteChange={handleSectionNoteChange}
            stickyPlaceholder={stickyPlaceholder}
            renderCellContent={renderCellContent}
          />
        );
      })}
    </div>
  );
}
