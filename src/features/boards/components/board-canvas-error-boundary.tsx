"use client";

import { Component, type ReactNode } from "react";

type BoardCanvasErrorBoundaryProps = {
  children: ReactNode;
  onBackToBoards: () => void;
};

type BoardCanvasErrorBoundaryState = {
  hasError: boolean;
};

export default class BoardCanvasErrorBoundary extends Component<
  BoardCanvasErrorBoundaryProps,
  BoardCanvasErrorBoundaryState
> {
  state: BoardCanvasErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): BoardCanvasErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Board canvas crashed", error);
  }

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <section
          style={{
            margin: "auto",
            width: "min(100%, 420px)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            background: "var(--surface)",
            color: "var(--text)",
            padding: "1rem",
            display: "grid",
            gap: "0.75rem",
            textAlign: "left",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16 }}>Board session crashed</h2>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 13 }}>
            The board hit an unexpected runtime error. Reload to recover this
            session, or return to your boards list.
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text)",
                height: 32,
                padding: "0 0.75rem",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Reload board
            </button>
            <button
              type="button"
              onClick={this.props.onBackToBoards}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "var(--surface)",
                color: "var(--text)",
                height: 32,
                padding: "0 0.75rem",
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Back to boards
            </button>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
