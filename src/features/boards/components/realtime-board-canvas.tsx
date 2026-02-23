import type { RealtimeBoardCanvasProps } from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types";
import RealtimeBoardCanvas from "@/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-legacy.impl";

export default function RealtimeBoardCanvasShell(props: RealtimeBoardCanvasProps) {
  return <RealtimeBoardCanvas {...props} />;
}
