import { useEffect } from "react";

import { isEditableKeyboardTarget } from "@/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry";

type ClipboardShortcutOptions = {
  copySelectedObjects: () => void;
  duplicateSelectedObjects: () => Promise<void>;
  pasteCopiedObjects: () => Promise<void>;
};

export function useClipboardShortcuts({
  copySelectedObjects,
  duplicateSelectedObjects,
  pasteCopiedObjects,
}: ClipboardShortcutOptions): void {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const normalizedKey = event.key.toLowerCase();
      if (normalizedKey === "d" && !event.shiftKey) {
        event.preventDefault();
        void duplicateSelectedObjects();
        return;
      }

      if (normalizedKey === "c" && !event.shiftKey) {
        event.preventDefault();
        copySelectedObjects();
        return;
      }

      if (normalizedKey === "v" && !event.shiftKey) {
        event.preventDefault();
        void pasteCopiedObjects();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [copySelectedObjects, duplicateSelectedObjects, pasteCopiedObjects]);
}
