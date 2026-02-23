import type { BoardObject } from "@/features/boards/types";
import {
  GRID_CONTAINER_MAX_COLS,
  GRID_CONTAINER_MAX_ROWS,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import type { GridContainerContentDraft } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import { GridContainer } from "@/features/ui/components/grid-container";

type GridContainerObjectContentProps = {
  objectItem: BoardObject;
  gridRows: number;
  gridCols: number;
  gridGap: number;
  gridTotalCells: number;
  gridCellColors: string[];
  gridContainerTitle: string;
  gridSectionTitles: string[];
  renderedObjectColor: string;
  resolvedTheme: "light" | "dark";
  isSingleSelected: boolean;
  canEdit: boolean;
  updateGridContainerDimensions: (
    objectId: string,
    nextRows: number,
    nextCols: number,
  ) => Promise<void>;
  getGridDraftForObject: (objectItem: BoardObject) => GridContainerContentDraft;
  queueGridContentSync: (
    objectId: string,
    draft: GridContainerContentDraft,
    options?: { immediate?: boolean },
  ) => void;
  saveGridContainerCellColors: (objectId: string, nextColors: string[]) => void;
};

export function GridContainerObjectContent({
  objectItem,
  gridRows,
  gridCols,
  gridGap,
  gridTotalCells,
  gridCellColors,
  gridContainerTitle,
  gridSectionTitles,
  renderedObjectColor,
  resolvedTheme,
  isSingleSelected,
  canEdit,
  updateGridContainerDimensions,
  getGridDraftForObject,
  queueGridContentSync,
  saveGridContainerCellColors,
}: GridContainerObjectContentProps) {
  return (
    <GridContainer
      rows={gridRows}
      cols={gridCols}
      gap={gridGap}
      minCellHeight={0}
      className="h-full w-full rounded-[10px] border-2 p-2 shadow-none"
      cellClassName="rounded-lg border-2 p-2"
      containerColor={renderedObjectColor}
      containerTitle={gridContainerTitle}
      cellColors={gridCellColors}
      sectionTitles={gridSectionTitles}
      chromeTone={resolvedTheme}
      sectionTitleTextColor={resolvedTheme === "dark" ? "rgba(241, 245, 249, 0.95)" : "#1f2937"}
      sectionBodyTextColor={resolvedTheme === "dark" ? "rgba(226, 232, 240, 0.95)" : "#334155"}
      containerTitleTextColor={resolvedTheme === "dark" ? "rgba(248, 250, 252, 0.98)" : "#0f172a"}
      showGridControls={isSingleSelected && canEdit}
      minRows={1}
      maxRows={GRID_CONTAINER_MAX_ROWS}
      minCols={1}
      maxCols={GRID_CONTAINER_MAX_COLS}
      onGridDimensionsChange={
        canEdit
          ? (nextRows, nextCols) => {
              void updateGridContainerDimensions(objectItem.id, nextRows, nextCols);
            }
          : undefined
      }
      onContainerTitleChange={
        canEdit
          ? (nextTitle) => {
              const currentDraft = getGridDraftForObject(objectItem);
              queueGridContentSync(
                objectItem.id,
                { ...currentDraft, containerTitle: nextTitle.slice(0, 120) },
                { immediate: true },
              );
            }
          : undefined
      }
      onSectionTitleChange={
        canEdit
          ? (sectionIndex, nextTitle) => {
              const currentDraft = getGridDraftForObject(objectItem);
              const nextTitles = [...currentDraft.sectionTitles];
              nextTitles[sectionIndex] = nextTitle.slice(0, 80);
              queueGridContentSync(
                objectItem.id,
                { ...currentDraft, sectionTitles: nextTitles },
                { immediate: true },
              );
            }
          : undefined
      }
      onCellColorChange={
        canEdit
          ? (cellIndex, color) => {
              const nextColors = Array.from(
                { length: gridTotalCells },
                (_, index) => gridCellColors[index] ?? "transparent",
              );
              nextColors[cellIndex] = color;
              saveGridContainerCellColors(objectItem.id, nextColors);
            }
          : undefined
      }
      showCellColorPickers
    />
  );
}
