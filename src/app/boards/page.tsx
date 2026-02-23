"use client";

import { useRouter } from "next/navigation";
import {
  type SyntheticEvent,
  useCallback,
  type KeyboardEvent,
  type FormEvent,
} from "react";

import { BoardsPageRow } from "@/app/boards/boards-page-row";
import { GoogleBrandIcon } from "@/app/boards/boards-page-icons";
import { useBoardsPageState } from "@/app/boards/use-boards-page-state";
import { MAX_OWNED_BOARDS } from "@/features/boards/types";
import AppHeader from "@/features/layout/components/app-header";

export default function BoardsPage() {
  const router = useRouter();
  const {
    authLoading,
    boards,
    boardsLoading,
    combinedErrorMessage,
    createBoardTitleInputRef,
    creatingBoard,
    deletingBoardId,
    editingBoardId,
    errorMessage,
    firebaseIsConfigured,
    handleCancelRenameBoard,
    handleCreateBoard,
    handleDeleteBoard,
    handleRenameBoardSubmit,
    handleShareBoard,
    handleSignIn,
    handleSignOut,
    handleStartRenameBoard,
    newBoardTitle,
    renameBoardTitle,
    renamingBoardId,
    setErrorMessage,
    setNewBoardTitle,
    setRenameBoardTitle,
    setShowCreateBoardForm,
    sharedBoardId,
    showCreateBoardForm,
    signingOut,
    user,
  } = useBoardsPageState();

  const handleOpenBoard = useCallback(
    (boardId: string) => {
      router.push(`/boards/${boardId}`);
    },
    [router],
  );

  const handleBoardRowKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>, boardId: string) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      handleOpenBoard(boardId);
    },
    [handleOpenBoard],
  );

  const stopRowNavigation = useCallback((event: SyntheticEvent) => {
    event.stopPropagation();
  }, []);

  const handleCreateBoardSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void handleCreateBoard();
    },
    [handleCreateBoard],
  );

  if (!firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 860, margin: "0 auto" }}>
        <h1>Boards</h1>
        <p>
          Firebase is not configured yet. Add your values to <code>.env.local</code>{" "}
          using <code>.env.example</code>.
        </p>
      </main>
    );
  }

  return (
    <main style={mainStyle}>
      <AppHeader
        user={user}
        onSignOut={user ? handleSignOut : null}
        signOutDisabled={signingOut}
      />

      <div style={contentStyle}>
        {authLoading ? <p>Checking authentication...</p> : null}

        {!authLoading && !user ? (
          <section style={signInSectionStyle}>
            <p style={{ margin: 0 }}>Sign in to create and manage your boards.</p>
            <button
              type="button"
              onClick={() => void handleSignIn()}
              style={signInButtonStyle}
            >
              <GoogleBrandIcon />
              <span>Sign in with Google</span>
            </button>
            {errorMessage ? <p style={{ color: "var(--danger-text)" }}>{errorMessage}</p> : null}
          </section>
        ) : null}

        {!authLoading && user ? (
          <section>
            <h2 style={{ margin: "0 0 0.8rem", fontSize: "1.2rem" }}>
              My Boards ({boards.length} out of {MAX_OWNED_BOARDS})
            </h2>

            {combinedErrorMessage ? (
              <p style={{ color: "var(--danger-text)" }}>{combinedErrorMessage}</p>
            ) : null}
            {boardsLoading ? <p>Loading boards...</p> : null}
            {!boardsLoading && boards.length === 0 ? (
              <p>
                No boards yet.
                {boards.length < MAX_OWNED_BOARDS ? " Create your first one." : ""}
              </p>
            ) : null}

            <ul style={boardsListStyle}>
              {boards.map((board) => (
                <BoardsPageRow
                  key={board.id}
                  board={board}
                  editingBoardId={editingBoardId}
                  renamingBoardId={renamingBoardId}
                  deletingBoardId={deletingBoardId}
                  sharedBoardId={sharedBoardId}
                  renameBoardTitle={renameBoardTitle}
                  onRenameBoardTitleChange={setRenameBoardTitle}
                  onOpenBoard={handleOpenBoard}
                  onBoardRowKeyDown={handleBoardRowKeyDown}
                  onStopRowNavigation={stopRowNavigation}
                  onStartRenameBoard={handleStartRenameBoard}
                  onRenameBoardSubmit={(boardId) => {
                    void handleRenameBoardSubmit(boardId);
                  }}
                  onCancelRenameBoard={handleCancelRenameBoard}
                  onShareBoard={(boardId) => {
                    void handleShareBoard(boardId);
                  }}
                  onDeleteBoard={(boardId) => {
                    void handleDeleteBoard(boardId);
                  }}
                />
              ))}
            </ul>

            {boards.length < MAX_OWNED_BOARDS ? (
              <div style={createSectionStyle}>
                {showCreateBoardForm ? (
                  <form onSubmit={handleCreateBoardSubmit} style={createFormStyle}>
                    <input
                      ref={createBoardTitleInputRef}
                      value={newBoardTitle}
                      onChange={(event) => setNewBoardTitle(event.target.value)}
                      placeholder="Board title"
                      maxLength={80}
                      disabled={creatingBoard}
                      autoFocus
                      style={createInputStyle}
                    />
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button type="submit" disabled={creatingBoard}>
                        {creatingBoard ? "Creating..." : "Create board"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!creatingBoard) {
                            setShowCreateBoardForm(false);
                            setNewBoardTitle("");
                          }
                        }}
                        disabled={creatingBoard}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setErrorMessage(null);
                      setShowCreateBoardForm(true);
                    }}
                    style={createBoardButtonStyle}
                  >
                    Create New Board
                  </button>
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

const mainStyle = {
  width: "100%",
  maxWidth: "none",
  margin: 0,
  boxSizing: "border-box",
  height: "100dvh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg)",
  color: "var(--text)",
} as const;

const contentStyle = {
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  width: "min(100%, 940px)",
  margin: "0 auto",
  padding: "1.25rem",
} as const;

const signInSectionStyle = {
  width: "min(100%, 460px)",
  margin: "4rem auto 0",
  display: "grid",
  justifyItems: "center",
  textAlign: "center",
  gap: "0.8rem",
} as const;

const signInButtonStyle = {
  height: 40,
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.6rem",
  padding: "0 0.95rem",
  fontWeight: 500,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 1px 2px rgba(15,23,42,0.18)",
} as const;

const boardsListStyle = { listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.75rem" } as const;
const createSectionStyle = { marginTop: "1rem", display: "grid", justifyItems: "center", gap: "0.55rem" } as const;

const createFormStyle = {
  display: "grid",
  justifyItems: "center",
  gap: "0.5rem",
  width: "min(100%, 420px)",
} as const;

const createInputStyle = {
  width: "100%",
  height: 40,
  padding: "0 0.7rem",
} as const;

const createBoardButtonStyle = {
  minWidth: 240,
  height: 46,
  padding: "0 1.1rem",
  borderRadius: 10,
  border: "1px solid #15803d",
  background: "#16a34a",
  color: "white",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 6px 16px rgba(22, 163, 74, 0.22)",
} as const;
