import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/boards/components/board-workspace", () => ({
  default: ({ boardId }: { boardId: string }) => (
    <div data-testid="board-workspace-mock">{boardId}</div>
  ),
}));

import BoardPage from "./page";

describe("BoardPage", () => {
  it("passes the route boardId into board workspace", async () => {
    const ui = await BoardPage({
      params: Promise.resolve({
        boardId: "board-123",
      }),
    });

    render(ui);

    expect(screen.getByTestId("board-workspace-mock").textContent).toBe(
      "board-123",
    );
  });
});
