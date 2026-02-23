import { resolveStickyBatchLayout } from "@/features/ai/openai/agents/board-agent-tools/sticky-layout";
import {
  buildStickyColorVariantBatches,
  shouldUseStickyColorVariants,
} from "@/features/ai/openai/agents/board-agent-tools/sticky-color-variants";
import {
  DEFAULT_BATCH_GAP_X,
  DEFAULT_BATCH_GAP_Y,
  DEFAULT_STICKY_COLOR,
  type BoardAgentToolBuildContext,
  toBoundedInt,
} from "@/features/ai/openai/agents/board-agent-tools/shared";

type CreateStickyBatchArgs = {
  count: number;
  color: string | null;
  originX: number | null;
  originY: number | null;
  columns: number | null;
  gapX: number | null;
  gapY: number | null;
  textPrefix: string | null;
};

export async function executeCreateStickyBatchTool(
  context: BoardAgentToolBuildContext,
  args: CreateStickyBatchArgs,
) {
  const count = toBoundedInt(args.count, 1, 1, 50);
  const resolvedLayout = resolveStickyBatchLayout({
    count,
    args: {
      originX: args.originX,
      originY: args.originY,
      columns: args.columns,
      gapX: args.gapX,
      gapY: args.gapY,
    },
    viewportBounds: context.options.viewportBounds,
    defaultPoint: context.defaultPoint,
    explicitCoordinateHints: context.explicitCoordinateHints,
    messageIntentHints: context.options.messageIntentHints,
  });
  if (shouldUseStickyColorVariants(context.options.messageIntentHints, args.color)) {
    const batches = buildStickyColorVariantBatches({
      count,
      originX: resolvedLayout.originX,
      originY: resolvedLayout.originY,
      columns: resolvedLayout.columns,
      gapX: resolvedLayout.gapX ?? DEFAULT_BATCH_GAP_X,
      gapY: resolvedLayout.gapY ?? DEFAULT_BATCH_GAP_Y,
    });
    const mergedCreatedObjectIds: string[] = [];
    let firstObjectId: string | undefined;
    for (const [batchIndex, batch] of batches.entries()) {
      const batchResult = await context.executeToolCallWithGuardrails(
        {
          tool: "createStickyBatch",
          args: {
            count: batch.count,
            color: batch.color,
            originX: batch.originX,
            originY: batch.originY,
            columns: resolvedLayout.columns,
            gapX: resolvedLayout.gapX ?? DEFAULT_BATCH_GAP_X,
            gapY: resolvedLayout.gapY ?? DEFAULT_BATCH_GAP_Y,
            textPrefix: args.textPrefix ?? undefined,
          },
        },
        {
          layoutMode: resolvedLayout.layoutMode,
          resolvedColumns: resolvedLayout.columns,
          resolvedGapX: resolvedLayout.gapX,
          resolvedGapY: resolvedLayout.gapY,
          colorMode: "various",
          colorBatchIndex: batchIndex,
        },
      );
      if (!firstObjectId && typeof batchResult.objectId === "string") {
        firstObjectId = batchResult.objectId;
      }
      if (Array.isArray(batchResult.createdObjectIds)) {
        mergedCreatedObjectIds.push(...batchResult.createdObjectIds);
      }
    }
    return {
      tool: "createStickyBatch" as const,
      objectId: firstObjectId,
      createdObjectIds: mergedCreatedObjectIds,
    };
  }
  return context.executeToolCallWithGuardrails(
    {
      tool: "createStickyBatch",
      args: {
        count,
        color:
          context.options.messageIntentHints?.stickyColorHint ??
          args.color ??
          DEFAULT_STICKY_COLOR,
        originX: resolvedLayout.originX,
        originY: resolvedLayout.originY,
        columns: resolvedLayout.columns,
        gapX: resolvedLayout.gapX ?? DEFAULT_BATCH_GAP_X,
        gapY: resolvedLayout.gapY ?? DEFAULT_BATCH_GAP_Y,
        textPrefix: args.textPrefix ?? undefined,
      },
    },
    {
      layoutMode: resolvedLayout.layoutMode,
      resolvedColumns: resolvedLayout.columns,
      resolvedGapX: resolvedLayout.gapX,
      resolvedGapY: resolvedLayout.gapY,
    },
  );
}
