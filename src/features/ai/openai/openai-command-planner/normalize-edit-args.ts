type OperationArgsInput = {
  tool: string;
  args: Record<string, unknown>;
  position: Record<string, unknown> | null;
  size: Record<string, unknown> | null;
};

export function normalizeEditOperationArgs({
  tool,
  args,
  position,
  size,
}: OperationArgsInput): void {
  if (tool === "moveObject") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }
    if (args.x === undefined && position) {
      args.x = position.x;
    }
    if (args.y === undefined && position) {
      args.y = position.y;
    }
    return;
  }

  if (tool === "resizeObject") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }
    if (args.width === undefined && size) {
      args.width = size.width;
    }
    if (args.height === undefined && size) {
      args.height = size.height;
    }
    return;
  }

  if (tool === "updateText") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }
    if (typeof args.newText !== "string") {
      const textCandidate = args.text ?? args.value ?? args.content;
      if (typeof textCandidate === "string") {
        args.newText = textCandidate;
      }
    }
    return;
  }

  if (tool === "changeColor") {
    if (typeof args.objectId !== "string") {
      const idCandidate = args.id ?? args.targetId;
      if (typeof idCandidate === "string") {
        args.objectId = idCandidate;
      }
    }
    if (typeof args.color !== "string") {
      const colorCandidate = args.colour ?? args.fill;
      if (typeof colorCandidate === "string") {
        args.color = colorCandidate;
      }
    }
    return;
  }

  if (tool === "deleteObjects") {
    if (!Array.isArray(args.objectIds)) {
      const objectId = args.objectId ?? args.id ?? args.targetId;
      if (typeof objectId === "string") {
        args.objectIds = [objectId];
      }
    }
    return;
  }

  if (tool === "fitFrameToContents" && typeof args.frameId !== "string") {
    const frameIdCandidate = args.objectId ?? args.id ?? args.targetId;
    if (typeof frameIdCandidate === "string") {
      args.frameId = frameIdCandidate;
    }
  }
}
