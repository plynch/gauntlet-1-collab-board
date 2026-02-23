import type { MutableRefObject } from "react";

import type { BoardObject } from "@/features/boards/types";
import {
  ClearTextIcon,
  ColorSwatchPicker,
} from "@/features/boards/components/realtime-canvas/canvas-controls";
import { OBJECT_LABEL_MAX_LENGTH } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { getObjectLabel } from "@/features/boards/components/realtime-canvas/board-object-helpers";
import { Button } from "@/features/ui/components/button";
import { IconButton } from "@/features/ui/components/icon-button";
import { Input } from "@/features/ui/components/input";

type SelectionHudPanelProps = {
  canShowSelectionHud: boolean;
  selectionHudPosition: { x: number; y: number } | null;
  selectionHudRef: MutableRefObject<HTMLDivElement | null>;
  resolvedTheme: "light" | "dark";
  canColorSelection: boolean;
  selectedColor: string | null;
  saveSelectedObjectsColor: (color: string) => Promise<void>;
  canResetSelectionRotation: boolean;
  resetSelectedObjectsRotation: () => Promise<void>;
  canEditSelectedLabel: boolean;
  singleSelectedObject: BoardObject | null;
  selectionLabelDraft: string;
  setSelectionLabelDraft: (value: string) => void;
  commitSelectionLabelDraft: () => Promise<void>;
  persistObjectLabelText: (objectId: string, value: string) => Promise<void>;
};

export function SelectionHudPanel({
  canShowSelectionHud,
  selectionHudPosition,
  selectionHudRef,
  resolvedTheme,
  canColorSelection,
  selectedColor,
  saveSelectedObjectsColor,
  canResetSelectionRotation,
  resetSelectedObjectsRotation,
  canEditSelectedLabel,
  singleSelectedObject,
  selectionLabelDraft,
  setSelectionLabelDraft,
  commitSelectionLabelDraft,
  persistObjectLabelText,
}: SelectionHudPanelProps) {
  if (!canShowSelectionHud || !selectionHudPosition) {
    return null;
  }

  const leadingTextSwatch =
    singleSelectedObject?.type === "text"
      ? {
          name: resolvedTheme === "dark" ? "White (text default)" : "Black (text default)",
          value: resolvedTheme === "dark" ? "#f8fafc" : "#0f172a",
        }
      : null;

  return (
    <div
      ref={selectionHudRef}
      data-selection-hud="true"
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      style={{
        position: "absolute",
        left: selectionHudPosition.x,
        top: selectionHudPosition.y,
        zIndex: 45,
        display: "grid",
        gap: "0.45rem",
        padding: "0.4rem 0.45rem",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "0 8px 20px rgba(0,0,0,0.14)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flexWrap: "wrap",
        }}
      >
        {canColorSelection ? (
          <ColorSwatchPicker
            currentColor={selectedColor ?? ""}
            leadingSwatch={leadingTextSwatch}
            onSelectColor={(nextColor) => {
              void saveSelectedObjectsColor(nextColor);
            }}
          />
        ) : null}
        {canResetSelectionRotation ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void resetSelectedObjectsRotation();
            }}
            className="h-8 rounded-md text-xs"
            style={{
              background: "var(--surface)",
              color: "var(--text)",
              borderColor: "var(--border)",
            }}
          >
            Reset rotation
          </Button>
        ) : null}
      </div>

      {canEditSelectedLabel && singleSelectedObject ? (
        <div
          style={{
            display: "grid",
            gap: "0.32rem",
            minWidth: 280,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: "var(--text-muted)",
              letterSpacing: "0.01em",
            }}
          >
            Label
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <Input
              value={selectionLabelDraft}
              onChange={(event) => {
                setSelectionLabelDraft(
                  event.target.value.slice(0, OBJECT_LABEL_MAX_LENGTH),
                );
              }}
              onBlur={() => {
                void commitSelectionLabelDraft();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitSelectionLabelDraft();
                  (event.currentTarget as HTMLInputElement).blur();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setSelectionLabelDraft(singleSelectedObject.text ?? "");
                  (event.currentTarget as HTMLInputElement).blur();
                }
              }}
              placeholder="Add label"
              aria-label={`Label for ${getObjectLabel(singleSelectedObject.type)}`}
              style={{
                height: 32,
                border: "1px solid var(--input-border)",
                background: "var(--input-bg)",
                color: "var(--text)",
              }}
            />
            <IconButton
              label="Clear label"
              size="sm"
              onClick={() => {
                setSelectionLabelDraft("");
                void persistObjectLabelText(singleSelectedObject.id, "");
              }}
              disabled={(singleSelectedObject.text ?? "").length === 0}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text-muted)",
              }}
            >
              <ClearTextIcon />
            </IconButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}
