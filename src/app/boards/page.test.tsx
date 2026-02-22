import type { User } from "firebase/auth";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BoardSummary } from "@/features/boards/types";

const mockUseAuthSession = vi.fn();
const mockUseOwnedBoardsLive = vi.fn();
const mockPush = vi.fn();

vi.mock("@/features/auth/hooks/use-auth-session", () => ({
  useAuthSession: () => mockUseAuthSession(),
}));

vi.mock("@/features/boards/hooks/use-owned-boards-live", () => ({
  useOwnedBoardsLive: (...args: unknown[]) => mockUseOwnedBoardsLive(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

import BoardsPage from "./page";

function createUser(email: string): User {
  return {
    uid: "user-1",
    email,
    displayName: "Patrick",
    photoURL: null,
  } as User;
}

function createBoard(id: string, title: string): BoardSummary {
  return {
    id,
    title,
    ownerId: "user-1",
    openEdit: true,
    openRead: true,
    createdAt: null,
    updatedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  mockUseAuthSession.mockReturnValue({
    firebaseIsConfigured: true,
    user: null,
    idToken: null,
    authLoading: false,
    signInWithGoogle: vi.fn(),
    signOutCurrentUser: vi.fn(),
  });

  mockUseOwnedBoardsLive.mockReturnValue({
    boards: [],
    boardsLoading: false,
    boardsError: null,
  });
});

describe("BoardsPage", () => {
  it("shows firebase configuration helper when firebase is unavailable", () => {
    mockUseAuthSession.mockReturnValue({
      firebaseIsConfigured: false,
      user: null,
      idToken: null,
      authLoading: false,
      signInWithGoogle: vi.fn(),
      signOutCurrentUser: vi.fn(),
    });

    render(<BoardsPage />);

    expect(screen.getByText("Boards")).toBeTruthy();
    expect(screen.getByText(/Firebase is not configured yet/i)).toBeTruthy();
  });

  it("shows google sign-in prompt when signed out", () => {
    render(<BoardsPage />);

    expect(
      screen.getByText("Sign in to create and manage your boards."),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Sign in with Google" }),
    ).toBeTruthy();
  });

  it("shows board list and create CTA when signed in", () => {
    mockUseAuthSession.mockReturnValue({
      firebaseIsConfigured: true,
      user: createUser("patrick@example.com"),
      idToken: "id-token",
      authLoading: false,
      signInWithGoogle: vi.fn(),
      signOutCurrentUser: vi.fn(),
    });

    mockUseOwnedBoardsLive.mockReturnValue({
      boards: [createBoard("board-1", "Demo Board")],
      boardsLoading: false,
      boardsError: null,
    });

    render(<BoardsPage />);

    expect(screen.getByText("My Boards (1 out of 3)")).toBeTruthy();
    expect(screen.getByText("Demo Board")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open board Demo Board" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Share board Demo Board" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create New Board" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
  });
});
