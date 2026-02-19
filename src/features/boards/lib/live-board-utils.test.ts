import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";

import {
  boardSortValue,
  getBoardPermissions,
  toBoardSummary,
  toLiveBoardDetail,
} from "@/features/boards/lib/live-board-utils";

describe("toBoardSummary", () => {
  it("parses board summary and falls back defaults", () => {
    const now = Timestamp.fromDate(new Date("2026-02-18T12:00:00.000Z"));
    const summary = toBoardSummary("board-1", {
      title: "",
      ownerId: "owner-1",
      openEdit: true,
      openRead: false,
      createdAt: now,
      updatedAt: now,
    });

    expect(summary.id).toBe("board-1");
    expect(summary.ownerId).toBe("owner-1");
    expect(summary.openEdit).toBe(true);
    expect(summary.openRead).toBe(false);
    expect(summary.createdAt).toBe("2026-02-18T12:00:00.000Z");
  });
});

describe("toLiveBoardDetail", () => {
  it("returns null for invalid board data", () => {
    expect(toLiveBoardDetail("board-1", { title: "Missing owner" })).toBeNull();
  });

  it("normalizes arrays and title fallback", () => {
    const detail = toLiveBoardDetail("board-1", {
      title: "   ",
      ownerId: "owner-1",
      openEdit: false,
      openRead: false,
      editorIds: ["editor-1", "", 1],
      readerIds: ["reader-1", null],
    });

    expect(detail).toEqual({
      id: "board-1",
      title: "Untitled board",
      ownerId: "owner-1",
      openEdit: false,
      openRead: false,
      editorIds: ["editor-1"],
      readerIds: ["reader-1"],
      createdAt: null,
      updatedAt: null,
    });
  });
});

describe("board permissions and sorting", () => {
  it("computes permissions with openRead/openEdit and explicit lists", () => {
    const detail = {
      id: "board-1",
      title: "Demo",
      ownerId: "owner",
      openEdit: false,
      openRead: false,
      editorIds: ["editor"],
      readerIds: ["reader"],
      createdAt: null,
      updatedAt: null,
    };

    expect(getBoardPermissions(detail, "owner")).toEqual({
      isOwner: true,
      canRead: true,
      canEdit: true,
    });
    expect(getBoardPermissions(detail, "editor").canEdit).toBe(true);
    expect(getBoardPermissions(detail, "reader").canRead).toBe(true);
    expect(getBoardPermissions(detail, "reader").canEdit).toBe(false);
  });

  it("prefers updatedAt sort value", () => {
    expect(
      boardSortValue({
        id: "x",
        title: "x",
        ownerId: "o",
        openEdit: false,
        openRead: true,
        createdAt: "2026-02-10T00:00:00.000Z",
        updatedAt: "2026-02-12T00:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-02-12T00:00:00.000Z"));
  });
});
