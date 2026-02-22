"use client";

import { FormEvent } from "react";
import type { CSSProperties } from "react";

type LabelEditorOverlayProps = {
  visible: boolean;
  text: string;
  left: number;
  top: number;
  onSubmit: (value: string) => void;
  onClose: () => void;
};

export default function LabelEditorOverlay({
  visible,
  text,
  left,
  top,
  onSubmit,
  onClose,
}: LabelEditorOverlayProps) {
  if (!visible) {
    return null;
  }

  const style: CSSProperties = {
    position: "absolute",
    left,
    top,
    minWidth: 220,
    padding: 8,
    borderRadius: 8,
    background: "var(--surface)",
    border: "1px solid var(--border)",
    boxShadow: "0 6px 24px rgba(0,0,0,0.15)",
    zIndex: 40,
  };

  return (
    <form
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const nextValue = new FormData(event.currentTarget).get("label");
        if (typeof nextValue === "string") {
          onSubmit(nextValue);
        }
      }}
      style={style}
      onBlur={onClose}
      onPointerDownCapture={(event) => event.stopPropagation()}
    >
      <textarea
        name="label"
        defaultValue={text}
        autoFocus
        rows={2}
        style={{
          width: "100%",
          resize: "vertical",
          borderRadius: 6,
          border: "1px solid var(--border)",
          background: "var(--surface-muted)",
          color: "var(--text)",
          fontSize: 12,
          lineHeight: 1.3,
          padding: 6,
          fontFamily: "inherit",
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 8,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text)",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 12,
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            border: "1px solid #2563eb",
            background: "#2563eb",
            color: "white",
            borderRadius: 6,
            padding: "2px 8px",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Save
        </button>
      </div>
    </form>
  );
}
