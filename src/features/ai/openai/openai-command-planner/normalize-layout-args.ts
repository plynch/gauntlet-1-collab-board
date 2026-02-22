import {
  asRecord,
  parseNumberValue,
} from "@/features/ai/openai/openai-command-planner/normalize-helpers";

type OperationArgsInput = {
  tool: string;
  args: Record<string, unknown>;
  position: Record<string, unknown> | null;
};

export function normalizeLayoutOperationArgs({
  tool,
  args,
  position,
}: OperationArgsInput): void {
  if (tool === "arrangeObjectsInGrid") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }
    if (args.columns === undefined) {
      const colCandidate =
        parseNumberValue(args.cols) ?? parseNumberValue(args.columnCount);
      if (colCandidate !== null) {
        args.columns = colCandidate;
      }
    }
    if (!asRecord(args.viewportBounds)) {
      const viewportCandidate = asRecord(args.viewport) ?? asRecord(args.bounds);
      if (viewportCandidate) {
        args.viewportBounds = viewportCandidate;
      }
    }
    if (typeof args.centerInViewport !== "boolean") {
      const centerCandidate = args.center ?? args.centered ?? args.inMiddle;
      if (typeof centerCandidate === "boolean") {
        args.centerInViewport = centerCandidate;
      }
    }
    return;
  }

  if (tool === "alignObjects") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }
    if (typeof args.alignment !== "string") {
      const alignmentCandidate = args.align ?? args.mode;
      if (typeof alignmentCandidate === "string") {
        args.alignment = alignmentCandidate.toLowerCase();
      }
    }
    return;
  }

  if (tool === "distributeObjects") {
    if (!Array.isArray(args.objectIds)) {
      const ids = args.ids ?? args.selectedObjectIds;
      if (Array.isArray(ids)) {
        args.objectIds = ids;
      }
    }
    if (typeof args.axis !== "string") {
      const axisCandidate = args.direction ?? args.distribution;
      if (typeof axisCandidate === "string") {
        args.axis = axisCandidate.toLowerCase();
      }
    }
    if (!asRecord(args.viewportBounds)) {
      const viewportCandidate = asRecord(args.viewport) ?? asRecord(args.bounds);
      if (viewportCandidate) {
        args.viewportBounds = viewportCandidate;
      }
    }
    return;
  }

  if (tool !== "moveObjects") {
    return;
  }

  if (!Array.isArray(args.objectIds)) {
    const ids = args.ids ?? args.selectedObjectIds;
    if (Array.isArray(ids)) {
      args.objectIds = ids;
    } else if (typeof args.objectId === "string") {
      args.objectIds = [args.objectId];
    }
  }
  if (!asRecord(args.delta)) {
    const dx = parseNumberValue(args.dx);
    const dy = parseNumberValue(args.dy);
    if (dx !== null || dy !== null) {
      args.delta = { dx: dx ?? 0, dy: dy ?? 0 };
    }
  }
  if (!asRecord(args.toPoint) && position) {
    args.toPoint = { x: position.x, y: position.y };
  } else if (!asRecord(args.toPoint)) {
    const xValue = parseNumberValue(args.x);
    const yValue = parseNumberValue(args.y);
    if (xValue !== null && yValue !== null) {
      args.toPoint = { x: xValue, y: yValue };
    }
  }
  if (!asRecord(args.toViewportSide)) {
    const sideCandidate =
      typeof args.side === "string"
        ? args.side
        : typeof args.viewportSide === "string"
          ? args.viewportSide
          : typeof args.targetSide === "string"
            ? args.targetSide
            : null;
    if (sideCandidate) {
      args.toViewportSide = {
        side: sideCandidate.toLowerCase(),
      };
    }
  }
  const toViewportSide = asRecord(args.toViewportSide);
  if (!toViewportSide) {
    return;
  }
  if (typeof toViewportSide.side === "string") {
    toViewportSide.side = toViewportSide.side.toLowerCase();
  }
  if (!asRecord(toViewportSide.viewportBounds)) {
    const viewportBoundsCandidate = asRecord(args.viewportBounds);
    if (viewportBoundsCandidate) {
      toViewportSide.viewportBounds = viewportBoundsCandidate;
    }
  }
}
