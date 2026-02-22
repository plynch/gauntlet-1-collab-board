# Audit Response (Fast Mitigation Pass)

Last updated: 2026-02-22

This file records what was fixed quickly for submission risk reduction, what was already present but mis-scored in the audit, and what remains post-submission work.

## High-Impact Fixes Shipped Today

### 1) API/runtime hardening
- Added document-id validation for board routes and AI board command parsing.
  - `src/server/api/route-helpers.ts`
  - `src/app/api/boards/[boardId]/route.ts`
  - `src/app/api/boards/[boardId]/access/route.ts`
  - `src/app/api/boards/[boardId]/presence/route.ts`
  - `src/features/ai/board-command.ts`
- Board creation limit check moved into a transaction to reduce race risk.
  - `src/app/api/boards/route.ts`

### 2) Firestore rules tightening
- Added board ACL create constraints (`editorIds`/`readerIds` must start empty).
- Added object/presence schema validation guards.
  - `firestore.rules`

### 3) Crash resilience
- Added board canvas error boundary with recovery actions ("Reload board", "Back to boards").
  - `src/features/boards/components/board-canvas-error-boundary.tsx`
  - `src/features/boards/components/board-workspace.tsx`

### 4) Collaboration visibility fix
- Container drag now sends throttled in-drag position writes (not only pointer-up).
  - `src/features/boards/components/realtime-board-canvas.tsx`

### 5) Connector performance mitigation (bounded, low-risk)
- Added viewport culling for off-screen connectors.
- Added per-candidate obstacle prefiltering by route solve bounds.
  - `src/features/boards/components/realtime-board-canvas.tsx`
  - `src/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry.ts`

## God Component Reduction (In Progress, Behavior-Preserving)

### Already extracted
- Large geometry/routing helpers:
  - `src/features/boards/components/realtime-canvas/legacy/legacy-canvas-geometry.ts`
- Legacy canvas constants/config:
  - `src/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-config.ts`
- Legacy canvas types:
  - `src/features/boards/components/realtime-canvas/legacy/realtime-board-canvas-types.ts`
- Clipboard shortcut effect:
  - `src/features/boards/components/realtime-canvas/legacy/use-clipboard-shortcuts.ts`

### Current state
- Primary file reduced from rollback baseline (~8363 lines) to ~7311 lines.
  - `src/features/boards/components/realtime-board-canvas.tsx`

## Audit “Missing Feature” Corrections (Already Implemented)

The following features are implemented in code and UI:
- Standalone text object (`text`)
- Line tool in toolbar (`line`)
- Duplicate (`Cmd/Ctrl + D`)
- Copy/paste (`Cmd/Ctrl + C` / `Cmd/Ctrl + V`)

Reference:
- `src/features/boards/components/realtime-board-canvas.tsx`
- `src/features/boards/types.ts`

## Build Verification

- Build passes after these changes:
  - `npm run build`

## Next Fast Follow (Post-Submission)

1. Continue incremental decomposition of `realtime-board-canvas.tsx` into hooks/modules.
2. Add targeted tests around extracted interaction modules.
3. Add stronger route-level rate limiting beyond AI endpoints.
4. Expand connector routing optimization with spatial indexing if needed.
