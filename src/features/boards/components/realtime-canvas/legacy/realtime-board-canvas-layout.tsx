"use client";

import type { ComponentProps } from "react";

import {
  COLLAPSED_PANEL_WIDTH,
  LEFT_PANEL_WIDTH,
  PANEL_COLLAPSE_ANIMATION,
  PANEL_SEPARATOR_COLOR,
  PANEL_SEPARATOR_WIDTH,
  RIGHT_PANEL_WIDTH,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";
import { AiAssistantFooter } from "@/features/boards/components/realtime-canvas/legacy/ai-assistant-footer";
import { LeftToolsPanel } from "@/features/boards/components/realtime-canvas/legacy/left-tools-panel";
import { LeftToolsPanelControls } from "@/features/boards/components/realtime-canvas/legacy/left-tools-panel-controls";
import { RightPresencePanel } from "@/features/boards/components/realtime-canvas/legacy/right-presence-panel";
import { StageSurface } from "@/features/boards/components/realtime-canvas/legacy/stage-surface";

type RealtimeBoardCanvasLayoutProps = {
  isLeftPanelCollapsed: boolean;
  isRightPanelCollapsed: boolean;
  canEdit: boolean;
  isAiSubmitting: boolean;
  isSwotTemplateCreating: boolean;
  hasDeletableSelection: boolean;
  selectedObjectCount: number;
  resolvedTheme: "light" | "dark";
  onLeftCollapse: () => void;
  onLeftExpand: () => void;
  onToolButtonClick: ComponentProps<typeof LeftToolsPanel>["onToolButtonClick"];
  onCreateSwot: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  leftControlsProps: ComponentProps<typeof LeftToolsPanelControls>;
  stageSurfaceProps: ComponentProps<typeof StageSurface>;
  onlineUsers: ComponentProps<typeof RightPresencePanel>["onlineUsers"];
  onRightCollapse: () => void;
  onRightExpand: () => void;
  aiFooterProps: ComponentProps<typeof AiAssistantFooter>;
};

export function RealtimeBoardCanvasLayout({
  isLeftPanelCollapsed,
  isRightPanelCollapsed,
  canEdit,
  isAiSubmitting,
  isSwotTemplateCreating,
  hasDeletableSelection,
  selectedObjectCount,
  resolvedTheme,
  onLeftCollapse,
  onLeftExpand,
  onToolButtonClick,
  onCreateSwot,
  onDuplicate,
  onDelete,
  leftControlsProps,
  stageSurfaceProps,
  onlineUsers,
  onRightCollapse,
  onRightExpand,
  aiFooterProps,
}: RealtimeBoardCanvasLayoutProps) {
  return (
    <section
      style={{
        height: "100%",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        background: "var(--surface)",
        color: "var(--text)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          display: "grid",
          gridTemplateColumns: `${isLeftPanelCollapsed ? COLLAPSED_PANEL_WIDTH : LEFT_PANEL_WIDTH}px ${PANEL_SEPARATOR_WIDTH}px minmax(0, 1fr) ${PANEL_SEPARATOR_WIDTH}px ${isRightPanelCollapsed ? COLLAPSED_PANEL_WIDTH : RIGHT_PANEL_WIDTH}px`,
          transition: `grid-template-columns ${PANEL_COLLAPSE_ANIMATION}`,
        }}
      >
        <LeftToolsPanel
          isCollapsed={isLeftPanelCollapsed}
          canEdit={canEdit}
          isAiSubmitting={isAiSubmitting}
          isSwotTemplateCreating={isSwotTemplateCreating}
          hasDeletableSelection={hasDeletableSelection}
          selectedObjectCount={selectedObjectCount}
          resolvedTheme={resolvedTheme}
          onCollapse={onLeftCollapse}
          onExpand={onLeftExpand}
          onToolButtonClick={onToolButtonClick}
          onCreateSwot={onCreateSwot}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        >
          <LeftToolsPanelControls {...leftControlsProps} />
        </LeftToolsPanel>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <div
          style={{
            minWidth: 0,
            minHeight: 0,
            position: "relative",
          }}
        >
          <StageSurface {...stageSurfaceProps} />
        </div>

        <div
          style={{
            background: PANEL_SEPARATOR_COLOR,
            boxShadow: "inset 0 0 0 1px rgba(15, 23, 42, 0.14)",
          }}
        />

        <RightPresencePanel
          isCollapsed={isRightPanelCollapsed}
          onlineUsers={onlineUsers}
          onCollapse={onRightCollapse}
          onExpand={onRightExpand}
        />
      </div>

      <AiAssistantFooter {...aiFooterProps} />
    </section>
  );
}
