import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/boards/components/board-settings-workspace", () => ({
  default: ({ boardId }: { boardId: string }) => (
    <div data-testid="board-settings-workspace-mock">{boardId}</div>
  )
}));

import BoardSettingsPage from "./page";

describe("BoardSettingsPage", () => {
  it("passes the route boardId into board settings workspace", async () => {
    const ui = await BoardSettingsPage({
      params: Promise.resolve({
        boardId: "board-settings-123"
      })
    });

    render(ui);

    expect(screen.getByTestId("board-settings-workspace-mock").textContent).toBe(
      "board-settings-123"
    );
  });
});
