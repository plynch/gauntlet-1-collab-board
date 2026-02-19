import { describe, expect, it } from "vitest";

import {
  canUserEditBoard,
  canUserReadBoard,
  parseBoardDoc,
} from "@/server/boards/board-access";

describe("parseBoardDoc", () => {
  it("returns null when owner id is missing", () => {
    expect(parseBoardDoc({ title: "Demo" })).toBeNull();
  });

  it("normalizes title and list fields", () => {
    const parsed = parseBoardDoc({
      title: "   ",
      ownerId: "owner-1",
      openEdit: 1,
      openRead: 0,
      editorIds: ["editor-1", "", 10],
      readerIds: ["reader-1", null],
    });

    expect(parsed).toEqual({
      title: "Untitled board",
      ownerId: "owner-1",
      openEdit: true,
      openRead: false,
      editorIds: ["editor-1"],
      readerIds: ["reader-1"],
      createdAt: undefined,
      updatedAt: undefined,
    });
  });
});

describe("board access helpers", () => {
  const board = {
    title: "Roadmap",
    ownerId: "owner",
    openEdit: false,
    openRead: false,
    editorIds: ["editor"],
    readerIds: ["reader"],
    createdAt: null,
    updatedAt: null,
  };

  it("grants read access to owner, reader, and editor", () => {
    expect(canUserReadBoard(board, "owner")).toBe(true);
    expect(canUserReadBoard(board, "reader")).toBe(true);
    expect(canUserReadBoard(board, "editor")).toBe(true);
  });

  it("grants edit access only to owner and editors when openEdit is off", () => {
    expect(canUserEditBoard(board, "owner")).toBe(true);
    expect(canUserEditBoard(board, "editor")).toBe(true);
    expect(canUserEditBoard(board, "reader")).toBe(false);
  });
});
