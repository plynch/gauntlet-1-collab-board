import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/auth/components/account-workspace", () => ({
  default: () => (
    <div data-testid="account-workspace-mock">Account Workspace Mock</div>
  ),
}));

import AccountPage from "./page";

describe("AccountPage", () => {
  it("renders the account workspace", () => {
    render(<AccountPage />);

    expect(screen.getByTestId("account-workspace-mock")).toBeTruthy();
  });
});
