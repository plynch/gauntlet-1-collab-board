import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("./boards/page", () => ({
  default: () => <div data-testid="boards-page-mock">Boards Page Mock</div>,
}));

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the boards page component", () => {
    render(<HomePage />);

    expect(screen.getByTestId("boards-page-mock")).toBeTruthy();
  });
});
