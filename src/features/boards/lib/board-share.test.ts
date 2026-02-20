import { describe, expect, it } from "vitest";

import { getBoardShareUrl } from "@/features/boards/lib/board-share";

describe("getBoardShareUrl", () => {
  it("builds board URL from origin and board id", () => {
    expect(getBoardShareUrl("board-123", "https://collabboard.app")).toBe(
      "https://collabboard.app/boards/board-123",
    );
  });

  it("trims trailing slash from origin", () => {
    expect(getBoardShareUrl("board-123", "https://collabboard.app/")).toBe(
      "https://collabboard.app/boards/board-123",
    );
  });
});
