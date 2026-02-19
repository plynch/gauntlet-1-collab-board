import type { PresenceUser } from "@/features/boards/types";

import { getPresenceLabel } from "@/features/boards/components/realtime-canvas/use-presence-sync";

type Viewport = {
  x: number;
  y: number;
  scale: number;
};

type RemoteCursorLayerProps = {
  remoteCursors: PresenceUser[];
  viewport: Viewport;
};

export function RemoteCursorLayer({
  remoteCursors,
  viewport
}: RemoteCursorLayerProps) {
  return (
    <>
      {remoteCursors.map((presenceUser) => (
        <div
          key={presenceUser.uid}
          style={{
            position: "absolute",
            left: viewport.x + (presenceUser.cursorX ?? 0) * viewport.scale,
            top: viewport.y + (presenceUser.cursorY ?? 0) * viewport.scale,
            pointerEvents: "none",
            transform: "translate(-2px, -2px)"
          }}
        >
          <svg
            width="18"
            height="24"
            viewBox="0 0 18 24"
            style={{
              display: "block",
              filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))"
            }}
            aria-hidden="true"
          >
            <path
              d="M2 1.5 L2 18.8 L6.6 14.9 L9.2 22 L12 20.8 L9.5 13.8 L16.2 13.8 Z"
              fill={presenceUser.color}
              stroke="white"
              strokeWidth="1.15"
              strokeLinejoin="round"
            />
          </svg>
          <div
            style={{
              marginTop: 2,
              marginLeft: 10,
              padding: "2px 6px",
              borderRadius: 999,
              background: presenceUser.color,
              color: "white",
              fontSize: 11,
              whiteSpace: "nowrap"
            }}
          >
            {getPresenceLabel(presenceUser)}
          </div>
        </div>
      ))}
    </>
  );
}

type OnlineUsersListProps = {
  onlineUsers: PresenceUser[];
};

export function OnlineUsersList({ onlineUsers }: OnlineUsersListProps) {
  if (onlineUsers.length === 0) {
    return <span style={{ color: "#6b7280" }}>No active users yet.</span>;
  }

  return (
    <>
      {onlineUsers.map((presenceUser) => (
        <span
          key={presenceUser.uid}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis"
          }}
          title={getPresenceLabel(presenceUser)}
        >
          <span style={{ color: presenceUser.color }}>●</span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis"
            }}
          >
            {getPresenceLabel(presenceUser)}
          </span>
        </span>
      ))}
    </>
  );
}
