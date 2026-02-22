import Link from "next/link";
import type {
  KeyboardEvent,
  SyntheticEvent,
  FormEvent,
  CSSProperties,
} from "react";

import type { BoardSummary } from "@/features/boards/types";
import {
  AccessIcon,
  DeleteIcon,
  EditIcon,
  ShareBoardIcon,
  boardActionButtonStyle,
} from "@/app/boards/boards-page-icons";

type BoardsPageRowProps = {
  board: BoardSummary;
  editingBoardId: string | null;
  renamingBoardId: string | null;
  deletingBoardId: string | null;
  sharedBoardId: string | null;
  renameBoardTitle: string;
  onRenameBoardTitleChange: (nextTitle: string) => void;
  onOpenBoard: (boardId: string) => void;
  onBoardRowKeyDown: (event: KeyboardEvent<HTMLElement>, boardId: string) => void;
  onStopRowNavigation: (event: SyntheticEvent) => void;
  onStartRenameBoard: (board: BoardSummary) => void;
  onRenameBoardSubmit: (boardId: string) => void;
  onCancelRenameBoard: () => void;
  onShareBoard: (boardId: string) => void;
  onDeleteBoard: (boardId: string) => void;
};

export function BoardsPageRow({
  board,
  editingBoardId,
  renamingBoardId,
  deletingBoardId,
  sharedBoardId,
  renameBoardTitle,
  onRenameBoardTitleChange,
  onOpenBoard,
  onBoardRowKeyDown,
  onStopRowNavigation,
  onStartRenameBoard,
  onRenameBoardSubmit,
  onCancelRenameBoard,
  onShareBoard,
  onDeleteBoard,
}: BoardsPageRowProps) {
  return (
    <li
      role="link"
      tabIndex={editingBoardId === board.id ? -1 : 0}
      aria-label={`Open board ${board.title}`}
      onClick={() => {
        if (editingBoardId !== board.id) {
          onOpenBoard(board.id);
        }
      }}
      onKeyDown={(event) => onBoardRowKeyDown(event, board.id)}
      style={rowStyle(editingBoardId === board.id)}
    >
      <div style={rowHeaderStyle}>
        <div style={titleAreaStyle}>
          {editingBoardId === board.id ? (
            <form
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                onRenameBoardSubmit(board.id);
              }}
              onClick={onStopRowNavigation}
              onKeyDown={onStopRowNavigation}
              style={{ display: "grid", gap: "0.5rem" }}
            >
              <input
                value={renameBoardTitle}
                onChange={(event) => onRenameBoardTitleChange(event.target.value)}
                placeholder="Board title"
                maxLength={80}
                disabled={renamingBoardId === board.id}
                style={{ height: 34, minWidth: 220, maxWidth: 460, padding: "0 0.6rem" }}
              />
              <div style={{ display: "flex", gap: "0.45rem", flexWrap: "wrap" }}>
                <button type="submit" disabled={renamingBoardId === board.id}>
                  {renamingBoardId === board.id ? "Saving..." : "Save"}
                </button>
                <button type="button" onClick={onCancelRenameBoard} disabled={renamingBoardId === board.id}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={(event) => {
                  onStopRowNavigation(event);
                  onStartRenameBoard(board);
                }}
                disabled={renamingBoardId === board.id}
                className="icon-tooltip-trigger"
                data-tooltip={renamingBoardId === board.id ? "Saving..." : "Rename board"}
                title={renamingBoardId === board.id ? "Saving..." : "Rename board"}
                aria-label={`Rename board ${board.title}`}
                style={renameButtonStyle(renamingBoardId === board.id)}
              >
                <EditIcon />
              </button>
              <div style={{ minWidth: 0 }}>
                <p style={titleTextStyle}>{board.title}</p>
                <p style={subtitleStyle}>
                  {board.openEdit ? "Open edit enabled" : "Restricted edit mode"}
                </p>
              </div>
            </>
          )}
        </div>

        <div style={actionsWrapStyle} onClick={onStopRowNavigation} onKeyDown={onStopRowNavigation}>
          <button
            type="button"
            onClick={() => onShareBoard(board.id)}
            className="icon-tooltip-trigger"
            data-tooltip={sharedBoardId === board.id ? "Copied board URL" : "Share board"}
            title={sharedBoardId === board.id ? "Copied board URL" : "Share board"}
            aria-label={`Share board ${board.title}`}
            style={boardActionButtonStyle}
          >
            <ShareBoardIcon />
          </button>
          <Link
            href={`/boards/${board.id}/settings`}
            onClick={onStopRowNavigation}
            className="icon-tooltip-trigger"
            data-tooltip="Manage access"
            title="Control access"
            aria-label={`Control access for ${board.title}`}
            style={boardActionButtonStyle}
          >
            <AccessIcon />
          </Link>
          <button
            type="button"
            onClick={() => onDeleteBoard(board.id)}
            disabled={deletingBoardId === board.id}
            className="icon-tooltip-trigger"
            data-tooltip={deletingBoardId === board.id ? "Deleting board..." : "Delete board"}
            title={deletingBoardId === board.id ? "Deleting board..." : "Delete board"}
            aria-label={`Delete board ${board.title}`}
            style={deleteButtonStyle(deletingBoardId === board.id)}
          >
            <DeleteIcon />
          </button>
        </div>
      </div>
    </li>
  );
}

const rowHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "0.75rem",
  flexWrap: "wrap",
} as const;

const titleAreaStyle = {
  minWidth: 0,
  flex: "1 1 240px",
  display: "flex",
  alignItems: "flex-start",
  gap: "0.55rem",
} as const;

const actionsWrapStyle = { display: "flex", gap: "0.4rem" } as const;
const titleTextStyle = { margin: 0, fontWeight: 700, fontSize: "1.45rem", lineHeight: 1.1 } as const;
const subtitleStyle = {
  margin: "0.28rem 0 0",
  color: "var(--text-muted)",
  fontSize: "1.05rem",
  lineHeight: 1.2,
} as const;

function rowStyle(isEditing: boolean): CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "0.9rem",
    cursor: isEditing ? "default" : "pointer",
    background: "var(--surface)",
  };
}

function renameButtonStyle(isSaving: boolean): CSSProperties {
  return {
    ...boardActionButtonStyle,
    width: 34,
    height: 34,
    borderRadius: 9,
    opacity: isSaving ? 0.75 : 1,
    flexShrink: 0,
  };
}

function deleteButtonStyle(isDeleting: boolean): CSSProperties {
  return {
    ...boardActionButtonStyle,
    borderColor: "rgba(248, 113, 113, 0.55)",
    background: isDeleting ? "rgba(239, 68, 68, 0.24)" : "rgba(239, 68, 68, 0.14)",
    color: "rgb(153, 27, 27)",
    opacity: isDeleting ? 0.75 : 1,
  };
}
