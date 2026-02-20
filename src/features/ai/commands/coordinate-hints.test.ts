import { describe, expect, it } from "vitest";

import { parseCoordinateHintsFromMessage } from "@/features/ai/commands/coordinate-hints";

describe("parseCoordinateHintsFromMessage", () => {
  it("parses at position x,y pattern", () => {
    expect(
      parseCoordinateHintsFromMessage(
        "Create a blue rectangle at position 100, 200",
      ),
    ).toEqual({
      hintedX: 100,
      hintedY: 200,
    });
  });

  it("returns null hints when no coordinates exist", () => {
    expect(parseCoordinateHintsFromMessage("Create a blue rectangle")).toEqual({
      hintedX: null,
      hintedY: null,
    });
  });
});
