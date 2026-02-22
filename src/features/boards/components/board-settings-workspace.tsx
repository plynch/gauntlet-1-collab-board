"use client";

import Link from "next/link";
import { useCallback } from "react";

import { BoardSettingsAccessSection } from "@/features/boards/components/board-settings-access-section";
import { useBoardSettingsState } from "@/features/boards/components/use-board-settings-state";
import AppHeader, {
  HeaderBackLink,
} from "@/features/layout/components/app-header";

type BoardSettingsWorkspaceProps = {
  boardId: string;
};

export default function BoardSettingsWorkspace({
  boardId,
}: BoardSettingsWorkspaceProps) {
  const state = useBoardSettingsState(boardId);

  const handleToggleOpenEdit = useCallback(
    async (nextOpenEdit: boolean) => {
      await state.updateAccess({ action: "set-open-edit", openEdit: nextOpenEdit });
    },
    [state],
  );
  const handleToggleOpenRead = useCallback(
    async (nextOpenRead: boolean) => {
      await state.updateAccess({ action: "set-open-read", openRead: nextOpenRead });
    },
    [state],
  );
  const handleAddEditor = useCallback(async () => {
    const email = state.newEditorEmail.trim();
    if (!email) {
      return;
    }
    const updatedBoard = await state.updateAccess({ action: "add-editor", editorEmail: email });
    if (updatedBoard) {
      state.setNewEditorEmail("");
    }
  }, [state]);
  const handleAddReader = useCallback(async () => {
    const email = state.newReaderEmail.trim();
    if (!email) {
      return;
    }
    const updatedBoard = await state.updateAccess({ action: "add-reader", readerEmail: email });
    if (updatedBoard) {
      state.setNewReaderEmail("");
    }
  }, [state]);

  if (!state.firebaseIsConfigured) {
    return (
      <main style={{ padding: "2rem", maxWidth: 980, margin: "0 auto" }}>
        <h1>Board Settings</h1>
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
        user={state.user}
        leftSlot={<HeaderBackLink href={`/boards/${boardId}`} label="Back to board" />}
        onSignOut={state.user ? state.handleSignOut : null}
        signOutDisabled={state.signingOut}
      />

      <div style={contentStyle}>
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>
          Access Settings{" "}
          <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
            ({state.board?.title ?? boardId})
          </span>
        </h2>
        <p style={{ margin: "0.35rem 0 1rem" }}>
          <Link href={`/boards/${boardId}`}>Back to board</Link>
        </p>

        {state.authLoading ? <p>Checking authentication...</p> : null}
        {!state.authLoading && !state.user ? (
          <section>
            <p>Sign in to manage board access.</p>
            <button type="button" onClick={() => void state.handleSignIn()}>
              Sign in with Google
            </button>
          </section>
        ) : null}

        {state.combinedErrorMessage ? (
          <p style={{ color: "#b91c1c" }}>{state.combinedErrorMessage}</p>
        ) : null}

        {!state.authLoading && state.user ? (
          <>
            {state.boardLoading ? <p>Loading board settings...</p> : null}
            {!state.boardLoading && state.board && state.permissions && !state.permissions.isOwner ? (
              <section style={ownerOnlyStyle}>
                <h2 style={{ marginTop: 0 }}>Owner-only settings</h2>
                <p style={{ marginTop: 0, color: "var(--text-muted)" }}>
                  Only the board owner can manage access for this board.
                </p>
                <p style={{ marginBottom: 0 }}>
                  <Link href={`/boards/${boardId}`}>Return to board</Link>
                </p>
              </section>
            ) : null}

            {!state.boardLoading && state.board && state.permissions?.isOwner ? (
              <section style={{ display: "grid", gap: "1rem" }}>
                <BoardSettingsAccessSection
                  title="Edit Access"
                  openLabel="Open edit mode (any signed-in user can edit)"
                  openValue={state.board.openEdit}
                  openDescription={
                    state.board.openEdit
                      ? "Open edit is on. Editor allowlist still persists if you later turn it off."
                      : "Open edit is off. Only you and users in editor allowlist can edit."
                  }
                  savingAccess={state.savingAccess}
                  inputPlaceholder="Editor email"
                  inputValue={state.newEditorEmail}
                  addLabel="Add editor"
                  emptyLabel="No editors in allowlist."
                  profiles={state.editorProfiles}
                  onToggleOpen={(value) => {
                    void handleToggleOpenEdit(value);
                  }}
                  onInputChange={state.setNewEditorEmail}
                  onAdd={() => {
                    void handleAddEditor();
                  }}
                  onRemove={(editorUid) => {
                    void state.updateAccess({ action: "remove-editor", editorUid });
                  }}
                />

                <BoardSettingsAccessSection
                  title="Read Access"
                  openLabel="Open read mode (any signed-in user can view)"
                  openValue={state.board.openRead}
                  openDescription={
                    state.board.openRead
                      ? "Open read is on. Reader allowlist still persists if you later turn it off."
                      : "Open read is off. Only you, editors, and reader allowlist users can view."
                  }
                  savingAccess={state.savingAccess}
                  inputPlaceholder="Reader email"
                  inputValue={state.newReaderEmail}
                  addLabel="Add reader"
                  emptyLabel="No readers in allowlist."
                  profiles={state.readerProfiles}
                  onToggleOpen={(value) => {
                    void handleToggleOpenRead(value);
                  }}
                  onInputChange={state.setNewReaderEmail}
                  onAdd={() => {
                    void handleAddReader();
                  }}
                  onRemove={(readerUid) => {
                    void state.updateAccess({ action: "remove-reader", readerUid });
                  }}
                />
              </section>
            ) : null}

            {!state.boardLoading && state.board && state.permissions?.isOwner && state.profilesLoading ? (
              <p style={{ color: "var(--text-muted)" }}>Refreshing access profiles...</p>
            ) : null}
          </>
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
  width: "min(100%, 980px)",
  margin: "0 auto",
  padding: "1.25rem",
} as const;

const ownerOnlyStyle = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "1rem",
  background: "var(--surface)",
} as const;
