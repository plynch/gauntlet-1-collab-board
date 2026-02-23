import type { BoardToolCall } from "@/features/ai/types";
import { FRAME_FIT_DEFAULT_PADDING, FRAME_FIT_MAX_PADDING, FRAME_FIT_MIN_PADDING } from "@/features/ai/tools/board-tools/constants";
import { ensureLoadedObjects, updateObject, type BoardExecutorState } from "@/features/ai/tools/board-tools/executor-state";
import { boundsOverlap, toCombinedBounds, toObjectBounds } from "@/features/ai/tools/board-tools/object-utils";
import { toGridDimension } from "@/features/ai/tools/board-tools/value-utils";

type ExecuteToolResultLike = {
  tool: BoardToolCall["tool"];
  objectId?: string;
  createdObjectIds?: string[];
  deletedCount?: number;
};

export async function fitFrameToContentsTool(
  state: BoardExecutorState,
  args: Extract<BoardToolCall, { tool: "fitFrameToContents" }>["args"],
): Promise<ExecuteToolResultLike> {
  await ensureLoadedObjects(state);
  const frame = state.objectsById.get(args.frameId);
  if (!frame) {
    throw new Error(`Frame not found: ${args.frameId}`);
  }
  const frameBounds = toObjectBounds(frame);
  const contentObjects = Array.from(state.objectsById.values()).filter(
    (objectItem) =>
      objectItem.id !== frame.id &&
      boundsOverlap(toObjectBounds(objectItem), frameBounds),
  );
  const contentBounds = toCombinedBounds(contentObjects);
  if (!contentBounds) {
    return { tool: "fitFrameToContents", objectId: frame.id };
  }
  const padding = toGridDimension(
    args.padding,
    FRAME_FIT_DEFAULT_PADDING,
    FRAME_FIT_MIN_PADDING,
    FRAME_FIT_MAX_PADDING,
  );
  await updateObject(state, frame.id, {
    x: contentBounds.left - padding,
    y: contentBounds.top - padding,
    width: Math.max(180, contentBounds.right - contentBounds.left + padding * 2),
    height: Math.max(120, contentBounds.bottom - contentBounds.top + padding * 2),
  });
  return { tool: "fitFrameToContents", objectId: frame.id };
}
