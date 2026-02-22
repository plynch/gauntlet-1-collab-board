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

const isCanvasRendererEnabled =
  process.env.NEXT_PUBLIC_ENABLE_CANVAS_RENDERER === "canvas";

export default function RealtimeBoardCanvas({
  boardId,
  user,
  permissions,
}: RealtimeBoardCanvasProps) {
  if (!isCanvasRendererEnabled) {
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
