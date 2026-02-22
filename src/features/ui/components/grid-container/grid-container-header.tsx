import type { RefObject } from "react";

import { GridDimensionPicker } from "@/features/ui/components/grid-container/grid-dimension-picker";
import { PencilEditIcon } from "@/features/ui/components/grid-container/pencil-edit-icon";

type DimensionPreview = {
  rows: number;
  cols: number;
};

type Setter<T> = (value: T | ((current: T) => T)) => void;

type GridContainerHeaderProps = {
  isEditingContainerTitle: boolean;
  onContainerTitleChange?: (nextTitle: string) => void;
  containerTitleDraft: string;
  setContainerTitleDraft: Setter<string>;
  commitContainerTitle: () => void;
  resolvedTitle: string;
  setIsEditingContainerTitle: Setter<boolean>;
  showGridControls: boolean;
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
  onGridDimensionsChange?: (nextRows: number, nextCols: number) => void;
  dimensionTriggerRef: RefObject<HTMLButtonElement | null>;
  dimensionPickerRef: RefObject<HTMLDivElement | null>;
  sectionBodyTextColor: string;
  sectionTitleTextColor: string;
  containerTitleTextColor: string;
};

export function GridContainerHeader({
  isEditingContainerTitle,
  onContainerTitleChange,
  containerTitleDraft,
  setContainerTitleDraft,
  commitContainerTitle,
  resolvedTitle,
  setIsEditingContainerTitle,
  showGridControls,
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
  onGridDimensionsChange,
  dimensionTriggerRef,
  dimensionPickerRef,
  sectionBodyTextColor,
  sectionTitleTextColor,
  containerTitleTextColor,
}: GridContainerHeaderProps) {
  return (
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
                title={resolvedTitle.length > 0 ? "Rename container title" : "Add container title"}
                aria-label={resolvedTitle.length > 0 ? "Rename container title" : "Add container title"}
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
            <h3 className="m-0 truncate text-center text-sm font-semibold" style={{ color: containerTitleTextColor }}>
              {resolvedTitle.length > 0 ? resolvedTitle : "Add title"}
            </h3>
          </div>
        ) : null}

        <GridDimensionPicker
          showGridControls={showGridControls}
          onGridDimensionsChange={onGridDimensionsChange}
          safeRows={safeRows}
          safeCols={safeCols}
          safeMinRows={safeMinRows}
          safeMaxRows={safeMaxRows}
          safeMinCols={safeMinCols}
          safeMaxCols={safeMaxCols}
          previewRows={previewRows}
          previewCols={previewCols}
          isDimensionPickerOpen={isDimensionPickerOpen}
          isDimensionDragSelecting={isDimensionDragSelecting}
          setIsDimensionPickerOpen={setIsDimensionPickerOpen}
          setIsDimensionDragSelecting={setIsDimensionDragSelecting}
          setDimensionPreview={setDimensionPreview}
          commitGridDimensions={commitGridDimensions}
          dimensionTriggerRef={dimensionTriggerRef}
          dimensionPickerRef={dimensionPickerRef}
          sectionBodyTextColor={sectionBodyTextColor}
          sectionTitleTextColor={sectionTitleTextColor}
        />
      </div>
    </div>
  );
}
