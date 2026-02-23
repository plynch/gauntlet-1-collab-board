import type { PresenceUser } from "@/features/boards/types";
import { OnlineUsersList } from "@/features/boards/components/realtime-canvas/render-primitives";

type RightPresencePanelProps = {
  isCollapsed: boolean;
  onlineUsers: PresenceUser[];
  onCollapse: () => void;
  onExpand: () => void;
};

export function RightPresencePanel({
  isCollapsed,
  onlineUsers,
  onCollapse,
  onExpand,
}: RightPresencePanelProps) {
  return (
    <aside
      style={{
        minWidth: 0,
        minHeight: 0,
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {isCollapsed ? (
        <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <button
            type="button"
            onClick={onExpand}
            title="Expand online users panel"
            aria-label="Expand online users panel"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
              borderLeft: "1px solid var(--border-strong)",
              borderRadius: 0,
              background: "var(--surface-subtle)",
              color: "var(--text)",
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
              cursor: "pointer",
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>{"<"}</span>
            <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
              Online users
            </span>
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              padding: 0,
              borderBottom: "1px solid var(--border)",
              display: "grid",
            }}
          >
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse online users panel"
              aria-label="Collapse online users panel"
              style={{
                width: "100%",
                height: 30,
                border: "none",
                borderRadius: 0,
                borderBottom: "1px solid var(--border-strong)",
                background: "var(--surface-subtle)",
                color: "var(--text)",
                fontWeight: 700,
                fontSize: 12,
                letterSpacing: 0.3,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.45rem",
                cursor: "pointer",
                transition:
                  "background-color 180ms ease, border-color 180ms ease, color 180ms ease",
              }}
            >
              <span>Online users</span>
              <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>
                ({onlineUsers.length})
              </span>
              <span style={{ fontSize: 16, lineHeight: 1 }}>{">"}</span>
            </button>
          </div>
          <div
            style={{
              padding: "0.75rem 0.8rem",
              overflowY: "auto",
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.45rem",
              fontSize: 14,
              color: "var(--text-muted)",
            }}
          >
            <OnlineUsersList onlineUsers={onlineUsers} />
          </div>
        </>
      )}
    </aside>
  );
}
