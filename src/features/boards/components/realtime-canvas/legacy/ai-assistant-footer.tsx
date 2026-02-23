import type {
  ChangeEventHandler,
  FormEventHandler,
  KeyboardEventHandler,
  MutableRefObject,
  PointerEventHandler,
} from "react";

import { AI_FOOTER_COLLAPSED_HEIGHT } from "@/features/boards/components/realtime-canvas/ai-footer-config";
import {
  PANEL_SEPARATOR_COLOR,
  PANEL_SEPARATOR_WIDTH,
} from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

type AiAssistantFooterProps = {
  isCollapsed: boolean;
  isResizing: boolean;
  isDrawerNudgeActive: boolean;
  height: number;
  selectedCount: number;
  chatMessages: ChatMessage[];
  isSubmitting: boolean;
  chatInput: string;
  chatMessagesRef: MutableRefObject<HTMLDivElement | null>;
  onResizeStart: PointerEventHandler<HTMLDivElement>;
  onToggleCollapsed: () => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onInputChange: ChangeEventHandler<HTMLInputElement>;
  onInputKeyDown: KeyboardEventHandler<HTMLInputElement>;
};

export function AiAssistantFooter({
  isCollapsed,
  isResizing,
  isDrawerNudgeActive,
  height,
  selectedCount,
  chatMessages,
  isSubmitting,
  chatInput,
  chatMessagesRef,
  onResizeStart,
  onToggleCollapsed,
  onSubmit,
  onInputChange,
  onInputKeyDown,
}: AiAssistantFooterProps) {
  return (
    <footer
      style={{
        height: isCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : height,
        minHeight: isCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : height,
        maxHeight: isCollapsed ? AI_FOOTER_COLLAPSED_HEIGHT : height,
        borderTop: `${PANEL_SEPARATOR_WIDTH}px solid ${PANEL_SEPARATOR_COLOR}`,
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        flexShrink: 0,
        transition: isResizing
          ? "none"
          : "height 220ms cubic-bezier(0.22, 1, 0.36, 1), min-height 220ms cubic-bezier(0.22, 1, 0.36, 1), max-height 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      }}
    >
      {!isCollapsed ? (
        <div
          onPointerDown={onResizeStart}
          style={{
            height: 18,
            borderBottom: "1px solid var(--border)",
            cursor: "ns-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-muted)",
            touchAction: "none",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              width: 38,
              height: 3,
              borderRadius: 999,
              background: "var(--border)",
            }}
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={isCollapsed ? "Expand AI assistant drawer" : "Collapse AI assistant drawer"}
        title={isCollapsed ? "Expand AI assistant drawer" : "Collapse AI assistant drawer"}
        style={{
          width: "100%",
          height: 30,
          border: "none",
          borderBottom: "1px solid var(--border-strong)",
          borderRadius: 0,
          background: isCollapsed ? "var(--surface-subtle)" : "var(--surface-muted)",
          color: "var(--text)",
          fontWeight: 700,
          fontSize: 12,
          lineHeight: 1,
          cursor: "pointer",
          letterSpacing: 0.3,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.45rem",
          flexShrink: 0,
          transform: isDrawerNudgeActive ? "translateY(-1px) scale(1.01)" : "translateY(0) scale(1)",
          boxShadow: isDrawerNudgeActive ? "0 0 0 4px rgba(14, 165, 233, 0.18)" : "none",
          transition:
            "background-color 180ms ease, border-color 180ms ease, color 180ms ease, transform 220ms ease, box-shadow 260ms ease",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: 16,
            lineHeight: 1,
            transform: isCollapsed
              ? "translateY(-1px) rotate(0deg)"
              : "translateY(1px) rotate(180deg)",
            transition: "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        >
          ^
        </span>
        <span>AI Assistant</span>
      </button>

      {isCollapsed ? (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "grid",
            alignItems: "stretch",
            padding: "0 clamp(0.8rem, 2vw, 1.5rem)",
          }}
        >
          <div
            style={{
              width: "min(100%, 800px)",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.75rem",
            }}
          >
            <strong style={{ fontSize: 13, color: "var(--text)" }}>AI Assistant</strong>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              ✨ Open for quick commands
            </span>
          </div>
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              padding: "0.45rem clamp(0.8rem, 2vw, 1.5rem)",
              borderBottom: "1px solid var(--border)",
              gap: "0.55rem",
            }}
          >
            <div
              style={{
                width: "min(100%, 800px)",
                margin: "0 auto",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.75rem",
                flexWrap: "wrap",
              }}
            >
              <strong style={{ fontSize: 13, color: "var(--text)" }}>AI Assistant</strong>
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Selected: {selectedCount} • ask naturally (/help)
              </span>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 0,
              padding: "0.6rem clamp(0.8rem, 2vw, 1.5rem)",
              background: "var(--surface-muted)",
              overflow: "hidden",
            }}
          >
            <div
              ref={chatMessagesRef}
              style={{
                height: "100%",
                width: "min(100%, 800px)",
                margin: "0 auto",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
                fontSize: 13,
              }}
            >
              {chatMessages.length === 0 ? (
                isSubmitting ? (
                  <div style={{ color: "var(--text-muted)", lineHeight: 1.45 }}>
                    Thinking...
                  </div>
                ) : (
                  <span style={{ color: "var(--text-muted)", lineHeight: 1.45 }}>
                    Ask naturally, or type /help for example commands.
                  </span>
                )
              ) : (
                <>
                  {chatMessages.map((message) => (
                    <div
                      key={message.id}
                      style={{
                        display: "flex",
                        justifyContent:
                          message.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "min(88%, 700px)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          padding: "0.5rem 0.65rem",
                          lineHeight: 1.45,
                          whiteSpace: "pre-wrap",
                          background:
                            message.role === "user"
                              ? "var(--chat-user-bubble)"
                              : "var(--chat-ai-bubble)",
                          color: "var(--text)",
                        }}
                      >
                        {message.text}
                      </div>
                    </div>
                  ))}
                  {isSubmitting ? (
                    <div style={{ color: "var(--text-muted)", lineHeight: 1.45 }}>
                      Thinking...
                    </div>
                  ) : null}
                </>
              )}
            </div>
          </div>
          <form onSubmit={onSubmit} style={{ display: "grid", padding: "0.55rem clamp(0.8rem, 2vw, 1.5rem)", borderTop: "1px solid var(--border)" }}>
            <div style={{ width: "min(100%, 800px)", margin: "0 auto", display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                value={chatInput}
                onChange={onInputChange}
                onKeyDown={onInputKeyDown}
                disabled={isSubmitting}
                placeholder="Ask the AI assistant to update this board..."
                maxLength={500}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: "0.48rem 0.58rem",
                  border: "1px solid var(--input-border)",
                  borderRadius: 8,
                  background: "var(--input-bg)",
                  color: "var(--text)",
                }}
              />
              <button type="submit" disabled={isSubmitting || chatInput.trim().length === 0}>
                {isSubmitting ? "Thinking..." : "Send"}
              </button>
            </div>
          </form>
        </>
      )}
    </footer>
  );
}
