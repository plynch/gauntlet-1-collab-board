"use client";

import { SwotResizeLabSignIn } from "@/features/boards/components/swot-resize-lab-signin";
import { SwotResizeLabStage } from "@/features/boards/components/swot-resize-lab-stage";
import { useSwotResizeLabState } from "@/features/boards/components/use-swot-resize-lab-state";

export default function SwotResizeLab() {
  const {
    user,
    setUser,
    sections,
    containerObject,
    stickyObjects,
    createSwot,
    addStickyToSection,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
  } = useSwotResizeLabState();

  if (!user) {
    return (
      <SwotResizeLabSignIn
        onSignInNewUser={() =>
          setUser({
            uid: "e2e-new-user",
            email: "new.user.e2e@example.com",
          })
        }
      />
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        background: "#e5e7eb",
        padding: 20,
      }}
    >
      <SwotResizeLabStage
        userEmail={user.email}
        containerObject={containerObject ?? null}
        sections={sections}
        stickyObjects={stickyObjects}
        onCreateSwot={createSwot}
        onAddStickyToSection={addStickyToSection}
        onResizePointerDown={handleResizePointerDown}
        onResizePointerMove={handleResizePointerMove}
        onResizePointerUp={handleResizePointerUp}
      />
    </main>
  );
}
