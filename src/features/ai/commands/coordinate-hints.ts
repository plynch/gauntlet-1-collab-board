export type CoordinateHints = {
  hintedX: number | null;
  hintedY: number | null;
};

export function parseCoordinateHintsFromMessage(
  message: string,
): CoordinateHints {
  const match = message.match(
    /\b(?:x\s*=?\s*(-?\d+(?:\.\d+)?)\s*y\s*=?\s*(-?\d+(?:\.\d+)?)|(?:at|to)\s*(?:position\s*)?(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?))/i,
  );
  if (!match) {
    return {
      hintedX: null,
      hintedY: null,
    };
  }

  const xValue = Number(match[1] ?? match[3]);
  const yValue = Number(match[2] ?? match[4]);
  return {
    hintedX: Number.isFinite(xValue) ? xValue : null,
    hintedY: Number.isFinite(yValue) ? yValue : null,
  };
}
