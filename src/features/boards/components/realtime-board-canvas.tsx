"use client";

import { BoardPermissions } from "@/features/boards/types";
import type { User } from "firebase/auth";
import BoardSceneCanvas from "@/features/boards/components/realtime-canvas/board-scene-canvas";
import RealtimeBoardCanvasLegacy from "@/features/boards/components/realtime-board-canvas-legacy";

type RealtimeBoardCanvasProps = {
  boardId: string;
  user: User;
  permissions: BoardPermissions;
};

const isLegacyRendererEnabled =
  process.env.NEXT_PUBLIC_ENABLE_CANVAS_RENDERER === "legacy";

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  if (isLegacyRendererEnabled) {
    return (
      <RealtimeBoardCanvasLegacy
        boardId={boardId}
        user={user}
        permissions={permissions}
      />
    );
  }

  return (
    <BoardSceneCanvas
      boardId={boardId}
      user={user}
      permissions={permissions}
    />
  );
}
