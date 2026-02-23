# CollabBoard — Comprehensive Action Plan

**Generated:** 2026-02-21
**Based on:** AUDIT.md (70 issues: 18 High, 28 Medium, 24 Low)
**Goal:** Bring CollabBoard to full requirements compliance, production-grade security, SOLID/modular architecture, and comprehensive test coverage.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [EPICs Overview](#2-epics-overview)
3. [EPIC 1: Security Hardening](#3-epic-1-security-hardening)
4. [EPIC 2: Missing Feature Implementation](#4-epic-2-missing-feature-implementation)
5. [EPIC 3: Canvas Decomposition](#5-epic-3-canvas-decomposition)
6. [EPIC 4: API and Server Hardening](#6-epic-4-api-and-server-hardening)
7. [EPIC 5: AI Agent Refinements](#7-epic-5-ai-agent-refinements)
8. [EPIC 6: Type Safety and DRY Consolidation](#8-epic-6-type-safety-and-dry-consolidation)
9. [EPIC 7: UI/UX Polish and Theming](#9-epic-7-uiux-polish-and-theming)
10. [EPIC 8: Testing and CI](#10-epic-8-testing-and-ci)
11. [EPIC 9: Performance Optimization](#11-epic-9-performance-optimization)
12. [Overall Recommendations](#12-overall-recommendations)
13. [Timeline Estimate](#13-timeline-estimate)

---

## 1. Executive Summary

This action plan addresses all 70 issues identified in AUDIT.md, organized into 9 EPICs with 22 feature branches containing 78 atomic commits. Work is prioritized to maximize impact:

**Phase 1 — Critical (Days 1–2):** Security vulnerabilities and missing requirements features. These are blocking issues that affect grading and production safety.

**Phase 2 — Structural (Days 2–4):** Canvas decomposition, API hardening, and AI agent bug fixes. These are the highest-ROI architectural improvements.

**Phase 3 — Quality (Days 4–6):** Type safety, DRY consolidation, UI polish, and documentation. These raise the codebase from functional to maintainable.

**Phase 4 — Hardening (Days 6–7):** Test coverage, CI integration, and performance optimization. These provide confidence for ongoing development.

| Phase | EPICs | Branches | Commits | Est. Hours |
|---|---|---|---|---|
| 1 — Critical | 1, 2 | 6 | 20 | 14–18 |
| 2 — Structural | 3, 4, 5 | 7 | 25 | 18–24 |
| 3 — Quality | 6, 7 | 5 | 17 | 12–16 |
| 4 — Hardening | 8, 9 | 4 | 16 | 14–18 |
| **Total** | **9** | **22** | **78** | **58–76** |

### Audit Issue Cross-Reference

Every audit ID is mapped to a specific commit below. Use this table to verify full coverage:

| Audit ID | Branch | Commit |
|---|---|---|
| SEC-01 | `fix/e2e-route-security` | 1.1.1 |
| SEC-02 | `fix/e2e-route-security` | 1.1.2 |
| SEC-10 | `fix/e2e-route-security` | 1.1.3 |
| SEC-03 | `fix/firestore-rules-hardening` | 1.2.1 |
| SEC-04 | `fix/firestore-rules-hardening` | 1.2.2 |
| SEC-12 | `fix/firestore-rules-hardening` | 1.2.3 |
| SEC-05 | `fix/input-validation-and-sanitization` | 1.3.1 |
| SEC-08 | `fix/input-validation-and-sanitization` | 1.3.2 |
| SEC-11 | `fix/input-validation-and-sanitization` | 1.3.3 |
| SEC-14 | `fix/input-validation-and-sanitization` | 1.3.4 |
| SEC-15 | `fix/input-validation-and-sanitization` | 1.3.5 |
| SEC-06 | `fix/api-security-misc` | 1.4.1 |
| SEC-07 | `fix/api-security-misc` | 1.4.2 |
| SEC-09 | `fix/api-security-misc` | 1.4.3 |
| SEC-13 | `fix/api-security-misc` | 1.4.4 |
| BUG-03 | `feature/missing-board-features` | 2.1.1 |
| — | `feature/missing-board-features` | 2.1.2–2.1.6 |
| CQ-01 | `refactor/canvas-decomposition-phase-1` | 3.1.1–3.1.5 |
| CQ-01 | `refactor/canvas-decomposition-phase-2` | 3.2.1–3.2.5 |
| CQ-13 | `refactor/canvas-decomposition-phase-1` | 3.1.2 |
| BUG-01 | `refactor/canvas-decomposition-phase-2` | 3.2.2 |
| BUG-08 | `refactor/canvas-decomposition-phase-2` | 3.2.3 |
| BUG-11 | `refactor/canvas-decomposition-phase-2` | 3.2.3 |
| BUG-04 | `fix/api-race-conditions-and-cascades` | 4.1.1 |
| BUG-09 | `fix/api-race-conditions-and-cascades` | 4.1.2 |
| BUG-10 | `fix/api-race-conditions-and-cascades` | 4.1.3 |
| BUG-13 | `fix/api-race-conditions-and-cascades` | 4.1.4 |
| BUG-19 | `fix/api-race-conditions-and-cascades` | 4.1.5 |
| BUG-20 | `fix/api-route-decomposition` | 4.2.2 |
| BUG-21 | `fix/api-race-conditions-and-cascades` | 4.1.6 |
| CQ-03 | `fix/api-route-decomposition` | 4.2.1–4.2.3 |
| BUG-12 | `fix/auth-error-handling` | 4.3.1 |
| BUG-22 | `fix/auth-error-handling` | 4.3.2 |
| BUG-05 | `fix/ai-agent-bugs` | 5.1.1 |
| BUG-06 | `fix/ai-agent-bugs` | 5.1.2 |
| BUG-07 | `fix/ai-agent-bugs` | 5.1.3 |
| BUG-14 | `fix/ai-agent-bugs` | 5.1.4 |
| BUG-17 | `fix/ai-agent-bugs` | 5.1.5 |
| CQ-02 | `refactor/ai-planner-decomposition` | 5.2.1–5.2.3 |
| CQ-12 | `refactor/ai-planner-decomposition` | 5.2.4 |
| CQ-05 | `refactor/type-safety-and-shared-modules` | 6.1.1 |
| CQ-06 | `refactor/type-safety-and-shared-modules` | 6.1.2 |
| CQ-07 | `refactor/type-safety-and-shared-modules` | 6.1.3 |
| CQ-15 | `refactor/type-safety-and-shared-modules` | 6.1.4 |
| BUG-16 | `refactor/type-safety-and-shared-modules` | 6.1.5 |
| BUG-18 | `refactor/type-safety-and-shared-modules` | 6.1.6 |
| CQ-08 | `refactor/e2e-helpers-consolidation` | 6.2.1–6.2.2 |
| BUG-15 | `refactor/e2e-helpers-consolidation` | 6.2.3 |
| CQ-04 | `refactor/ui-component-improvements` | 7.1.1 |
| CQ-09 | `refactor/ui-component-improvements` | 7.1.2 |
| CQ-10 | `refactor/ui-component-improvements` | 7.1.3 |
| CQ-14 | `refactor/ui-component-improvements` | 7.1.4 |
| CQ-11 | `fix/jsdoc-overhaul` | 7.2.1–7.2.3 |
| BUG-02 | `feature/performance-optimization` | 9.1.1–9.1.3 |

---

## 2. EPICs Overview

| # | EPIC | Priority | Branches | Audit Issues Covered |
|---|---|---|---|---|
| 1 | Security Hardening | **HIGH** | 4 | SEC-01–15 |
| 2 | Missing Feature Implementation | **HIGH** | 2 | 4 missing features + BUG-03 |
| 3 | Canvas Decomposition | **HIGH** | 2 | CQ-01, CQ-13, BUG-01, BUG-08, BUG-11 |
| 4 | API and Server Hardening | **HIGH** | 3 | CQ-03, BUG-04, 09, 10, 12, 13, 19, 20, 21, 22 |
| 5 | AI Agent Refinements | **MEDIUM** | 2 | CQ-02, CQ-12, BUG-05, 06, 07, 14, 17 |
| 6 | Type Safety and DRY Consolidation | **MEDIUM** | 2 | CQ-05–08, CQ-15, BUG-15, 16, 18 |
| 7 | UI/UX Polish and Theming | **LOW** | 2 | CQ-04, 09, 10, 11, 14 |
| 8 | Testing and CI | **MEDIUM** | 2 | Test coverage gaps |
| 9 | Performance Optimization | **MEDIUM** | 2 | BUG-02, perf targets |

---

## 3. EPIC 1: Security Hardening

**As a** platform operator, **I want** all endpoints secured and data validated at every boundary **so that** malicious users cannot bypass auth, inject data, or extract internal configuration.

**Priority:** HIGH — addresses 15 security findings including 5 high-severity issues.
**Estimated effort:** 6–8 hours.

---

### Branch 1.1: `fix/e2e-route-security`

**Related audit issues:** SEC-01, SEC-02, SEC-10
**User story:** As a developer, I want E2E/debug routes locked out of production so that test infrastructure cannot be weaponized.

#### Commit 1.1.1 — Hard-guard E2E custom-token route against production

**Sub-tasks:**

1. Open `src/app/api/e2e/custom-token/route.ts`.
2. Replace the `isE2eRouteEnabled()` function to remove the `ENABLE_E2E_LAB` bypass:

```typescript
function isE2eRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production";
}
```

3. Add a secondary guard inside the GET handler that verifies `FIREBASE_AUTH_EMULATOR_HOST` is set (defense-in-depth):

```typescript
if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  return NextResponse.json(
    { error: "Emulator host not configured." },
    { status: 403 },
  );
}
```

4. Add a unit test verifying the route returns 403 when `NODE_ENV=production`.

**SOLID alignment:** Single Responsibility — the guard function has one job (environment gating). The route handler delegates auth decisions to it rather than mixing concerns.

---

#### Commit 1.1.2 — Add authentication to `/api/ai/tracing-ready`

**Sub-tasks:**

1. Open `src/app/api/ai/tracing-ready/route.ts`.
2. Import `requireUser` from `@/server/auth/require-user`.
3. Add `const user = await requireUser(request);` as the first line of the GET handler. Return 401 if not authenticated.
4. Strip the `publicKeyPreview` and full `baseUrl` fields from the response — return only boolean readiness flags.
5. Add a unit test: unauthenticated request returns 401.

**SOLID alignment:** Interface Segregation — the response should expose the minimal information the client needs (readiness booleans), not internal infrastructure details.

---

#### Commit 1.1.3 — Secure E2E readiness routes

**Sub-tasks:**

1. Extract `isE2eRouteEnabled()` into a shared module `src/server/api/e2e-guard.ts` (fixes CQ-07 duplication).
2. Update `openai-ready/route.ts` and `langfuse-ready/route.ts` to import from the shared module.
3. Remove the `ENABLE_E2E_LAB` production override from both files (same pattern as 1.1.1).
4. Strip sensitive fields (model names, base URLs) from responses — return only boolean readiness.
5. Add unit tests for both routes.

---

### Branch 1.2: `fix/firestore-rules-hardening`

**Related audit issues:** SEC-03, SEC-04, SEC-12
**User story:** As a platform operator, I want Firestore rules to validate all document shapes so that malicious clients cannot inject arbitrary data.

#### Commit 1.2.1 — Add field validation for `objects` subcollection

**Sub-tasks:**

1. Open `firestore.rules`.
2. Add a `hasValidObjectFieldSet(obj)` function that restricts keys to the known set:

```
function hasValidObjectFieldSet(obj) {
  return obj.keys().hasOnly([
    'id', 'type', 'zIndex', 'x', 'y', 'width', 'height',
    'rotationDeg', 'color', 'text',
    'fromObjectId', 'toObjectId', 'fromAnchor', 'toAnchor',
    'fromX', 'fromY', 'toX', 'toY',
    'gridRows', 'gridCols', 'gridGap', 'gridCellColors',
    'containerTitle', 'gridSectionTitles', 'gridSectionNotes',
    'containerId', 'containerSectionIndex',
    'containerRelX', 'containerRelY', 'updatedAt'
  ]);
}
```

3. Add a `hasValidObjectFieldTypes(obj)` function checking critical types:

```
function hasValidObjectFieldTypes(obj) {
  return obj.type is string
    && obj.x is number
    && obj.y is number
    && obj.width is number
    && obj.height is number
    && obj.color is string
    && obj.text is string;
}
```

4. Apply both functions to the `allow create, update` rule for `objects/{objectId}`.
5. Add size limits: `obj.text.size() <= 10000`, `obj.color.size() <= 50`.

**SOLID alignment:** Open/Closed — new object fields can be added to the allowlist without modifying the validation logic structure.

---

#### Commit 1.2.2 — Enforce empty editor/reader lists on board creation

**Sub-tasks:**

1. In `firestore.rules`, update the board `allow create` rule to add:

```
&& request.resource.data.editorIds.size() == 0
&& request.resource.data.readerIds.size() == 0
```

2. Verify that the server-side board creation API (`src/app/api/boards/route.ts`) always passes empty arrays (it should — confirm by reading the code).
3. Test by attempting a Firestore write with pre-populated editor IDs via the emulator — expect rejection.

---

#### Commit 1.2.3 — Validate editor/reader list contents and add presence field validation

**Sub-tasks:**

1. Add list size cap to board update rules: `request.resource.data.editorIds.size() <= 50 && request.resource.data.readerIds.size() <= 50`.
2. Add `hasValidPresenceFieldSet(doc)` function restricting presence documents to known keys: `uid`, `displayName`, `email`, `color`, `cursorX`, `cursorY`, `active`, `lastSeenAt`, `lastSeenAtMs`.
3. Apply to `allow create, update` on `presence/{userId}`.
4. Deploy rules to emulator and run existing E2E tests to confirm no regressions.

---

### Branch 1.3: `fix/input-validation-and-sanitization`

**Related audit issues:** SEC-05, SEC-08, SEC-11, SEC-14, SEC-15
**User story:** As a developer, I want all external inputs validated and sanitized at ingestion boundaries so that XSS, path traversal, and injection attacks are prevented.

#### Commit 1.3.1 — Add `boardId` format validation

**Sub-tasks:**

1. Create `src/server/api/validators.ts` with:

```typescript
const FIRESTORE_DOC_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

/**
 * Validates that a Firestore document ID contains only safe characters.
 *
 * @param id - The document ID to validate
 * @returns true if the ID is safe for use in Firestore paths
 */
export function isValidFirestoreDocId(id: string): boolean {
  return FIRESTORE_DOC_ID_PATTERN.test(id);
}
```

2. Import and apply in `src/app/api/boards/[boardId]/route.ts` (GET, PATCH, DELETE), `access/route.ts`, `presence/route.ts`, and `src/app/api/ai/board-command/route.ts`. Return 400 if invalid.
3. Apply in `src/features/ai/tools/board-tools.ts` constructor and `src/features/ai/guardrail-store.firestore.ts`.
4. Add unit tests for the validator (empty string, slashes, valid IDs, 129-char ID).

**SOLID alignment:** Single Responsibility — validation logic lives in one place. Dependency Inversion — routes depend on the abstraction (`isValidFirestoreDocId`) not on raw regex checks.

---

#### Commit 1.3.2 — Validate color strings in `changeColor` tool

**Sub-tasks:**

1. Open `src/features/ai/tools/board-tools.ts`.
2. In the `changeColor` method, add validation before the Firestore write:

```typescript
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const validColor = HEX_COLOR_PATTERN.test(args.color)
  ? args.color
  : toNearestStickyPaletteColor(args.color);
```

3. Use `validColor` for the Firestore update instead of raw `args.color`.
4. Add unit test: arbitrary string input gets normalized, valid hex passes through.

---

#### Commit 1.3.3 — Sanitize user-supplied image URLs

**Sub-tasks:**

1. Create `src/features/auth/lib/sanitize-photo-url.ts`:

```typescript
const ALLOWED_PHOTO_HOSTS = [
  "lh3.googleusercontent.com",
  "gravatar.com",
  "avatars.githubusercontent.com",
];

/**
 * Validates that a photo URL is from an allowed origin and uses HTTPS.
 *
 * @param url - The URL to validate
 * @returns The validated URL, or null if rejected
 */
export function sanitizePhotoUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (!ALLOWED_PHOTO_HOSTS.some((h) => parsed.hostname.endsWith(h))) return null;
    return url;
  } catch {
    return null;
  }
}
```

2. Apply in `account-workspace.tsx` and `app-header.tsx` before rendering `<img>`.
3. Add unit tests: `javascript:` URL rejected, `http://` rejected, valid Google URL accepted.

---

#### Commit 1.3.4 — Fix API key redaction regex

**Sub-tasks:**

1. Open `src/features/ai/openai/openai-required-response.ts`.
2. Change regex from `sk-[a-z0-9_-]+` to `/sk-[a-zA-Z0-9_-]+/gi`.
3. Add unit test: `"key is sk-Proj-AbC123_def"` gets redacted to `"key is [REDACTED]"`.

---

#### Commit 1.3.5 — Add request body size limits

**Sub-tasks:**

1. In `src/app/api/ai/board-command/route.ts`, add Zod validation for `boardState` array length (max 500 items) and `selectedObjectIds` (max 200 items).
2. In `src/app/api/boards/route.ts` POST handler, add `title` max length to the Zod schema (if not already present).
3. Add Next.js route segment config for body size where applicable:

```typescript
export const config = { api: { bodyParser: { sizeLimit: "256kb" } } };
```

---

### Branch 1.4: `fix/api-security-misc`

**Related audit issues:** SEC-06, SEC-07, SEC-09, SEC-13
**User story:** As a platform operator, I want defense-in-depth across all API endpoints so that timing attacks, spam, and information leaks are mitigated.

#### Commit 1.4.1 — Use constant-time comparison for MCP internal token

**Sub-tasks:**

1. Open `src/app/api/mcp/templates/route.ts`.
2. Replace `received === expected` with:

```typescript
import { timingSafeEqual } from "node:crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```

3. Update `isAuthorized` to use `safeCompare`.
4. Add unit test verifying equal-length tokens with one character difference still return false.

---

#### Commit 1.4.2 — Add global rate limiting middleware

**Sub-tasks:**

1. Create `src/server/api/rate-limiter.ts`:

```typescript
/**
 * In-memory sliding-window rate limiter for API mutation endpoints.
 *
 * @param userId - Authenticated user ID
 * @param windowMs - Window duration in milliseconds
 * @param maxRequests - Maximum requests per window
 * @returns Object with { allowed: boolean, retryAfterMs?: number }
 */
export function checkRateLimit(
  userId: string,
  windowMs: number,
  maxRequests: number,
): { allowed: boolean; retryAfterMs?: number } { ... }
```

2. Use a `Map<string, number[]>` of timestamps per userId. Prune entries older than `windowMs` on each check.
3. Apply in `src/app/api/boards/route.ts` (POST), `boards/[boardId]/route.ts` (PATCH, DELETE), `boards/[boardId]/access/route.ts` (PATCH). Use window of 60s, max 30 requests.
4. Return 429 with `Retry-After` header when rate limit exceeded.
5. Add unit tests for the limiter: under limit passes, over limit rejects, window expiry allows new requests.

**SOLID alignment:** Single Responsibility — rate limiting is its own module. Open/Closed — can change window/max per route without modifying the limiter. Dependency Inversion — routes depend on the `checkRateLimit` abstraction.

---

#### Commit 1.4.3 — Gate debug error details behind explicit flag

**Sub-tasks:**

1. Open `src/server/api/route-helpers.ts`.
2. Change the `debug` field inclusion from `NODE_ENV !== "production"` to:

```typescript
const includeDebug = process.env.DEBUG_ERRORS === "true";
```

3. Update `src/app/api/ai/board-command/route.ts` to use the same pattern.
4. Remove `debug` from the default error response shape — only include when the flag is set.

---

#### Commit 1.4.4 — Add Content-Security-Policy header

**Sub-tasks:**

1. Open `next.config.ts`.
2. Add a `Content-Security-Policy` header to the existing headers array:

```typescript
{
  key: "Content-Security-Policy",
  value: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https://lh3.googleusercontent.com https://*.gravatar.com data:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://api.openai.com https://*.langfuse.com",
    "frame-src https://accounts.google.com https://*.firebaseapp.com",
  ].join("; "),
}
```

3. Test locally by checking browser console for CSP violations during normal usage.
4. Iterate on the policy to resolve any legitimate violations.

---

## 4. EPIC 2: Missing Feature Implementation

**As a** user, **I want** standalone text elements, object duplication, copy/paste, and line creation **so that** the whiteboard meets all specification requirements.

**Priority:** HIGH — 4 features from the requirements are missing or inaccessible.
**Estimated effort:** 8–10 hours.

---

### Branch 2.1: `feature/missing-board-features`

**Related audit issues:** Missing text, duplicate, copy/paste, line tool in toolbar; BUG-03 (error boundary)
**User story:** As a whiteboard user, I want to create standalone text, duplicate objects, copy/paste, and draw lines so that I have the full set of board tools described in the requirements.

#### Commit 2.1.1 — Add React Error Boundary to canvas

**Sub-tasks:**

1. Create `src/features/boards/components/board-error-boundary.tsx`:

```typescript
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; boardId: string; }
interface State { hasError: boolean; error: Error | null; }

/**
 * Error boundary for the board canvas. Catches runtime errors and
 * presents a recovery UI instead of a white screen.
 *
 * @param props.boardId - Board identifier for error reporting
 */
export class BoardErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Board canvas error:", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, textAlign: "center" }}>
          <h2>Something went wrong on this board.</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Reload Board
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

2. Wrap `<RealtimeBoardCanvas>` in `BoardErrorBoundary` inside the board page component.
3. Add a unit test that verifies the fallback UI renders when a child throws.

**SOLID alignment:** Single Responsibility — error recovery is separated from canvas logic. Open/Closed — the boundary can be extended with error reporting (e.g., Sentry) without modifying the canvas.

---

#### Commit 2.1.2 — Add standalone text object type

**Sub-tasks:**

1. Add `"text"` to `BoardObjectKind` in `src/features/boards/types.ts`.
2. Add default size/color for text in canvas utility functions (`getDefaultObjectSize`, `getDefaultObjectColor`, `getObjectLabel`).
3. Add `{ tool: "text", label: "Text", icon: "T" }` to the `BOARD_TOOLS` array in `realtime-board-canvas.tsx`.
4. Add rendering logic in the canvas render section: a text object renders as a borderless, background-transparent `<div>` with editable text content, styled with a user-selectable font size.
5. Ensure text objects participate in selection, drag, resize, and delete operations (they should work identically to sticky notes but without the background card styling).
6. Add the `text` type to the Firestore rules `hasValidObjectFieldSet` (from 1.2.1).
7. Add unit test for default text object properties.

---

#### Commit 2.1.3 — Add line tool to toolbar

**Sub-tasks:**

1. Verify `"line"` exists in `BoardObjectKind` (it does per audit).
2. Add `{ tool: "line", label: "Line", icon: "—" }` to the `BOARD_TOOLS` array.
3. Add default size for line type in `getDefaultObjectSize` (e.g., width: 200, height: 4).
4. Add rendering for line objects in the canvas: a horizontal line with configurable color, resize stretches the line, rotation rotates it.
5. Verify line objects work with selection, drag, and delete.

---

#### Commit 2.1.4 — Implement duplicate operation

**Sub-tasks:**

1. In the canvas component (or extracted `useObjectCrud` hook), add a `duplicateSelected` function:

```typescript
/**
 * Duplicates all currently selected objects, offsetting
 * the copies by a fixed amount to make them visually distinct.
 *
 * @param selectedObjects - Array of objects to duplicate
 * @param offset - Pixel offset for duplicated objects (default 20)
 */
async function duplicateSelected(
  selectedObjects: BoardObject[],
  offset = 20,
): Promise<void> {
  const batch = db.batch();
  const newIds: string[] = [];
  for (const obj of selectedObjects) {
    const newId = doc(collection(db, `boards/${boardId}/objects`)).id;
    batch.set(doc(db, `boards/${boardId}/objects`, newId), {
      ...obj,
      id: newId,
      x: obj.x + offset,
      y: obj.y + offset,
    });
    newIds.push(newId);
  }
  await batch.commit();
  setSelectedObjectIds(new Set(newIds));
}
```

2. Add a "Duplicate" button to the Selection HUD (next to Delete).
3. Add keyboard shortcut: `Ctrl/Cmd + D`.
4. Add unit test for the offset and ID generation logic.

---

#### Commit 2.1.5 — Implement copy/paste for board objects

**Sub-tasks:**

1. Add a `clipboardRef = useRef<BoardObject[]>([])` to store copied objects.
2. Implement `copySelected`:

```typescript
function copySelected(): void {
  clipboardRef.current = selectedObjects.map((obj) => ({ ...obj }));
}
```

3. Implement `pasteFromClipboard`:

```typescript
async function pasteFromClipboard(): Promise<void> {
  if (clipboardRef.current.length === 0) return;
  const batch = db.batch();
  const newIds: string[] = [];
  const offset = 30;
  for (const obj of clipboardRef.current) {
    const newId = doc(collection(db, `boards/${boardId}/objects`)).id;
    batch.set(doc(db, `boards/${boardId}/objects`, newId), {
      ...obj,
      id: newId,
      x: obj.x + offset,
      y: obj.y + offset,
    });
    newIds.push(newId);
  }
  await batch.commit();
  setSelectedObjectIds(new Set(newIds));
}
```

4. Wire keyboard shortcuts: `Ctrl/Cmd + C` → copy, `Ctrl/Cmd + V` → paste.
5. Add "Copy" button to Selection HUD.

---

#### Commit 2.1.6 — Add AI tool support for new object types

**Sub-tasks:**

1. Update `board-tool-schema.ts` to accept `"text"` and `"line"` in `createShape` type enum.
2. Update `deterministic-command-planner.ts` to handle "create a text element" and "create a line" commands.
3. Add unit tests for the new command parsing.

---

### Branch 2.2: `feature/collaboration-resilience`

**User story:** As a user, I want to see when my connection drops and know when it recovers so that I understand the sync state of my board.

#### Commit 2.2.1 — Add connection status indicator

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-connection-status.ts`:

```typescript
/**
 * Monitors Firestore connection state and exposes a status
 * enum for the UI to display reconnection banners.
 *
 * @returns Connection status: "connected" | "disconnected" | "reconnecting"
 */
export function useConnectionStatus(): "connected" | "disconnected" | "reconnecting" { ... }
```

2. Use Firestore's `.info/connected` special document to detect online/offline state.
3. Create `src/features/boards/components/connection-banner.tsx` that displays a yellow "Reconnecting..." banner when disconnected.
4. Integrate into the board page layout.
5. Add unit test for the hook's state transitions.

---

## 5. EPIC 3: Canvas Decomposition

**As a** developer, **I want** the 9,076-line canvas component split into focused, testable modules **so that** I can maintain, review, and test each concern independently.

**Priority:** HIGH — the god component is the single biggest quality risk.
**Estimated effort:** 8–12 hours (split across 2 branches to keep PRs reviewable).

---

### Branch 3.1: `refactor/canvas-decomposition-phase-1`

**Related audit issues:** CQ-01, CQ-13
**User story:** As a developer, I want viewport, selection, and keyboard logic extracted into custom hooks so that the main canvas component is under 3,000 lines.

#### Commit 3.1.1 — Extract `useCanvasViewport` hook

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-canvas-viewport.ts`.
2. Move all pan/zoom state (`viewport`, `setViewport`), wheel handler, zoom controls, `MIN_SCALE`/`MAX_SCALE` constants, and the `screenToCanvas`/`canvasToScreen` transform functions into this hook.
3. The hook should return: `{ viewport, setViewport, screenToCanvas, canvasToScreen, handleWheel, zoomIn, zoomOut, zoomToFit }`.
4. Replace the original code in `realtime-board-canvas.tsx` with the hook call.
5. Run existing E2E tests to verify no regression.

**SOLID alignment:** Single Responsibility — viewport management is one concern. Interface Segregation — consumers receive a focused API, not the entire canvas state.

---

#### Commit 3.1.2 — Extract `useCanvasStateStore` (unified ref store)

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-canvas-state-store.ts`.
2. Consolidate all ~15 `useRef` mirrors (CQ-13) into a single `useRef<CanvasStateSnapshot>` that is updated via a single `useEffect`:

```typescript
interface CanvasStateSnapshot {
  viewport: Viewport;
  canEdit: boolean;
  snapToGridEnabled: boolean;
  selectedObjectIds: Set<string>;
  activeTool: string;
  objects: BoardObject[];
}

/**
 * Provides a stable ref to the latest canvas state for use
 * in imperative event handlers that cannot rely on React closures.
 *
 * @param state - Current canvas state values
 * @returns Ref to the latest state snapshot
 */
export function useCanvasStateStore(state: CanvasStateSnapshot): React.RefObject<CanvasStateSnapshot> { ... }
```

3. Replace all individual `useRef` + `useEffect` pairs with reads from the single store ref.
4. This eliminates ~30 lines of boilerplate and the stale-closure category of bugs.

---

#### Commit 3.1.3 — Extract `useMarqueeSelection` hook

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-marquee-selection.ts`.
2. Move marquee drag state, pointer-down/move/up handlers for selection box, and the `computeObjectsInRect` logic.
3. Hook signature: `useMarqueeSelection({ objects, screenToCanvas, stateStoreRef })`.
4. Returns: `{ marqueeRect, isSelecting, selectedByMarquee }`.
5. Replace original code with the hook call.

---

#### Commit 3.1.4 — Extract `useKeyboardShortcuts` hook

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-keyboard-shortcuts.ts`.
2. Move all `keydown`/`keyup` event listeners, including: delete shortcut, Ctrl+D (duplicate), Ctrl+C/V (copy/paste), Ctrl+A (select all), Escape (deselect), Ctrl+Z (undo, if exists).
3. Hook receives action callbacks as parameters (dependency inversion — shortcut handler doesn't know about Firestore):

```typescript
interface KeyboardActions {
  deleteSelected: () => void;
  duplicateSelected: () => void;
  copySelected: () => void;
  pasteFromClipboard: () => void;
  selectAll: () => void;
  deselectAll: () => void;
}

/**
 * Registers global keyboard shortcuts for board operations.
 * Cleans up listeners on unmount.
 *
 * @param actions - Callback map for each keyboard-triggered action
 * @param enabled - Whether shortcuts are active (false during text editing)
 */
export function useKeyboardShortcuts(actions: KeyboardActions, enabled: boolean): void { ... }
```

---

#### Commit 3.1.5 — Extract `CanvasToolbar` component

**Sub-tasks:**

1. Create `src/features/boards/components/canvas-toolbar.tsx`.
2. Move the tool selection bar JSX and its state (`activeTool`, `setActiveTool`) into this component.
3. Props: `{ activeTool, onToolChange, tools }`.
4. This is a pure presentational component — it receives data and emits events.
5. Add unit test: clicking a tool button calls `onToolChange` with the correct tool ID.

---

### Branch 3.2: `refactor/canvas-decomposition-phase-2`

**Related audit issues:** CQ-01, BUG-01, BUG-08, BUG-11
**User story:** As a developer, I want drag, resize, connector, and AI chat logic extracted into custom hooks so that the main canvas is purely a composition layer.

#### Commit 3.2.1 — Extract `useObjectDrag` hook

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-object-drag.ts`.
2. Move drag state, pointer-down/move/up handlers for object dragging, throttled position batch writes, and snap-to-grid logic.
3. Fix BUG-01 inside this extraction: add throttled writes for container drags (200ms interval) instead of only writing on pointer-up.
4. Hook signature: `useObjectDrag({ objectsByIdRef, updatePositionsBatch, stateStoreRef, boardId })`.
5. Add unit test for the throttle behavior and container drag writes.

---

#### Commit 3.2.2 — Extract `useCornerResize` and `useRotate` hooks

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-corner-resize.ts` — resize handle state, pointer handlers, minimum size enforcement, constrained resize for circles.
2. Create `src/features/boards/hooks/use-rotate.ts` — rotation state, 15° snapping, pointer handlers.
3. Both hooks receive Firestore write callbacks as parameters (Dependency Inversion).
4. Replace original code with hook calls.

---

#### Commit 3.2.3 — Extract `useAiChat` hook and `AiFooter` component

**Sub-tasks:**

1. Create `src/features/boards/hooks/use-ai-chat.ts` — AI command input state, submission handler, response processing, loading state.
2. Fix BUG-08 inside this extraction: use `objectsByIdRef.current` (from the state store) instead of the stale `objects` state array in `applySelectionUpdate`.
3. Fix BUG-11: replace `objects.find()` with `objectsByIdRef.current.get(objectId)` for O(1) lookup.
4. Create `src/features/boards/components/ai-footer.tsx` — AI command input UI, message history display, loading indicator.
5. Add unit test for the AI chat hook: verify stale closure is avoided by testing with a mock objectsByIdRef.

---

#### Commit 3.2.4 — Extract `SelectionHud` component

**Sub-tasks:**

1. Create `src/features/boards/components/selection-hud.tsx`.
2. Move the selection HUD JSX: color picker, delete button, duplicate button, resize/rotate controls, text update controls.
3. Props: `{ selectedObjects, onDelete, onDuplicate, onColorChange, onTextChange, onResize }`.
4. Pure presentational component.

---

#### Commit 3.2.5 — Slim down `realtime-board-canvas.tsx` to composition layer

**Sub-tasks:**

1. The main component should now only: compose hooks, render the canvas container `<div>`, render children from extracted components.
2. Target: under 1,500 lines (down from 9,076).
3. Run all E2E tests to verify no behavioral regressions.
4. Add a code comment at the top documenting the module's composition architecture.

---

## 6. EPIC 4: API and Server Hardening

**As a** developer, **I want** API routes free of race conditions, data leaks, and structural issues **so that** the server layer is reliable and maintainable.

**Priority:** HIGH for race conditions, MEDIUM for structural.
**Estimated effort:** 6–8 hours.

---

### Branch 4.1: `fix/api-race-conditions-and-cascades`

**Related audit issues:** BUG-04, BUG-09, BUG-10, BUG-13, BUG-19, BUG-21

#### Commit 4.1.1 — Wrap board creation in Firestore transaction

**Sub-tasks:**

1. Open `src/app/api/boards/route.ts`.
2. Replace the sequential query-then-create with a transaction:

```typescript
const boardRef = db.collection("boards").doc();
await db.runTransaction(async (txn) => {
  const existing = await txn.get(
    db.collection("boards")
      .where("ownerId", "==", user.uid)
      .limit(MAX_OWNED_BOARDS),
  );
  if (existing.size >= MAX_OWNED_BOARDS) {
    throw new Error("BOARD_LIMIT_REACHED");
  }
  txn.set(boardRef, boardData);
});
```

3. Catch the `"BOARD_LIMIT_REACHED"` error and return 409.
4. Add unit test with mocked transaction that simulates concurrent creation.

---

#### Commit 4.1.2 — Wrap board access updates in transaction

**Sub-tasks:**

1. Open `src/app/api/boards/[boardId]/access/route.ts`.
2. Wrap the read-validate-update flow in `db.runTransaction()`.
3. Replace the chained `if` statements with a `switch (payload.action)` for readability (fixes CQ smell).

---

#### Commit 4.1.3 — Cascade board deletion to subcollections

**Sub-tasks:**

1. Open `src/app/api/boards/[boardId]/route.ts`.
2. Before deleting the board document, delete all documents in `objects`, `presence`, and `aiRuns` subcollections:

```typescript
async function deleteSubcollection(
  boardRef: FirebaseFirestore.DocumentReference,
  subcollection: string,
): Promise<void> {
  const snap = await boardRef.collection(subcollection).limit(500).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  if (snap.size === 500) {
    await deleteSubcollection(boardRef, subcollection);
  }
}
```

3. Call for all three subcollections before `boardRef.delete()`.
4. Add unit test with mocked Firestore verifying subcollection deletion.

---

#### Commit 4.1.4 — Fix PATCH board response to include editors/readers

**Sub-tasks:**

1. Open `src/app/api/boards/[boardId]/route.ts`.
2. In the PATCH handler, resolve editor and reader profiles (like the GET handler does) before returning.
3. Alternatively, change the response type to omit `editors`/`readers` and document this in the API.

---

#### Commit 4.1.5 — Remove duplicate `BoardDoc` type

**Sub-tasks:**

1. Open `src/app/api/boards/route.ts`.
2. Remove the local `BoardDoc` type definition (lines 16–23).
3. Import `BoardDoc` from `@/server/boards/board-access`.
4. Use `parseBoardDoc` for type-safe parsing of Firestore data.

---

#### Commit 4.1.6 — Fix dual timestamp in presence

**Sub-tasks:**

1. Open `src/app/api/boards/[boardId]/presence/route.ts`.
2. Remove `lastSeenAtMs: Date.now()`.
3. Keep only `lastSeenAt: FieldValue.serverTimestamp()`.
4. Update any client code that reads `lastSeenAtMs` to read from `lastSeenAt` instead, converting the Firestore Timestamp to milliseconds.

---

### Branch 4.2: `fix/api-route-decomposition`

**Related audit issues:** CQ-03, BUG-20

#### Commit 4.2.1 — Extract AI planner orchestrator

**Sub-tasks:**

1. Create `src/features/ai/orchestration/planner-orchestrator.ts`.
2. Move the planner selection logic (deterministic → OpenAI → MCP fallback chain) from the route handler into a standalone function:

```typescript
/**
 * Selects and executes the appropriate AI planner for a board command.
 * Tries deterministic planner first, falls back to OpenAI, then MCP templates.
 *
 * @param request - Parsed board command request
 * @param boardState - Current board object snapshot
 * @param options - Configuration (planner mode, model, timeouts)
 * @returns Execution result with tool calls, objects created, and trace info
 */
export async function orchestrateBoardCommand(
  request: BoardCommandRequest,
  boardState: BoardObjectSnapshot[],
  options: PlannerOptions,
): Promise<PlannerResult> { ... }
```

3. The route handler should only: parse request, check auth/rate-limit/lock, call orchestrator, format response.

---

#### Commit 4.2.2 — Extract AI trace and budget helpers

**Sub-tasks:**

1. Create `src/features/ai/orchestration/trace-helpers.ts` — move all tracing setup/teardown functions.
2. Create `src/features/ai/orchestration/budget-helpers.ts` — move budget reservation/release/finalization.
3. Fix BUG-20: rename shadowed `payload` variables to `responsePayload` during extraction.
4. The route handler imports and calls these instead of inlining the logic.

---

#### Commit 4.2.3 — Slim down AI board-command route to ~100 lines

**Sub-tasks:**

1. The POST handler should now follow this structure:

```typescript
export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request);
  const parsed = parseBoardCommandRequest(await request.json());
  await checkRateLimit(user.uid);
  const lock = await acquireBoardLock(parsed.boardId);
  try {
    const result = await orchestrateBoardCommand(parsed, ...);
    return NextResponse.json(formatResponse(result));
  } finally {
    await lock.release();
  }
}
```

2. Target: under 150 lines for the route file.
3. Run existing E2E AI tests to verify no regression.

---

### Branch 4.3: `fix/auth-error-handling`

**Related audit issues:** BUG-12, BUG-22

#### Commit 4.3.1 — Handle Google sign-in popup errors

**Sub-tasks:**

1. Open `src/features/auth/hooks/use-auth-session.ts`.
2. Wrap `signInWithPopup` in try/catch:

```typescript
const signInWithGoogle = useCallback(async () => {
  if (!auth) return;
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error: unknown) {
    if (error instanceof FirebaseError && error.code === "auth/popup-closed-by-user") {
      return;
    }
    setAuthError(error instanceof Error ? error.message : "Sign-in failed");
  }
}, [auth]);
```

3. Add `authError` state and expose it from the hook.
4. Add unit test: popup-closed-by-user is silently ignored, other errors surface.

---

#### Commit 4.3.2 — Fix `useMemo` dependency in account workspace

**Sub-tasks:**

1. Open `src/features/auth/components/account-workspace.tsx`.
2. Change `[user]` dependency to `[user?.displayName, user?.email, user?.uid]`.
3. This prevents unnecessary recomputation when the User object reference changes but the relevant fields haven't.

---

## 7. EPIC 5: AI Agent Refinements

**As a** developer, **I want** AI agent bugs fixed and the planner decomposed **so that** AI commands are reliable and the code is maintainable.

**Priority:** MEDIUM.
**Estimated effort:** 6–8 hours.

---

### Branch 5.1: `fix/ai-agent-bugs`

**Related audit issues:** BUG-05, BUG-06, BUG-07, BUG-14, BUG-17

#### Commit 5.1.1 — Add `createShapeBatch` to OpenAI planner Zod schema

**Sub-tasks:**

1. Open `src/features/ai/openai/openai-command-planner.ts`.
2. Add to the `boardToolCallSchema` discriminated union:

```typescript
z.object({
  tool: z.literal("createShapeBatch"),
  args: z.object({
    shapes: z.array(z.object({
      type: z.string(),
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
      color: z.string().optional(),
    })),
  }),
}),
```

3. Add unit test: Zod parse succeeds for a `createShapeBatch` tool call.

---

#### Commit 5.1.2 — Fix in-place mutation in `moveObjects`

**Sub-tasks:**

1. Open `src/features/ai/tools/board-tools.ts`.
2. In the `moveObjects` method, clone objects before mutation:

```typescript
const updatedPositions = new Map<string, { x: number; y: number }>();
for (const objectItem of matchedObjects) {
  updatedPositions.set(objectItem.id, {
    x: objectItem.x + deltaX,
    y: objectItem.y + deltaY,
  });
}
await this.updateObjectsInBatch(
  [...updatedPositions.entries()].map(([id, pos]) => ({
    id,
    updates: { x: pos.x, y: pos.y },
  })),
);
```

3. Only update the cache after the write succeeds.
4. Add unit test: verify cache is unchanged if the write throws.

---

#### Commit 5.1.3 — Use Firestore batch writes in `createShapeBatch`

**Sub-tasks:**

1. In `board-tools.ts`, refactor `createShapeBatch` to use `this.db.batch()`:

```typescript
const batch = this.db.batch();
for (const shape of args.shapes) {
  const docRef = this.objectsCollection.doc();
  batch.set(docRef, buildShapeDoc(shape));
}
await batch.commit();
```

2. Mirror the pattern from `createStickyBatch`.
3. Add unit test: verify batch is used instead of individual writes.

---

#### Commit 5.1.4 — Replace unsafe OpenAI trace ID access

**Sub-tasks:**

1. Open `src/features/ai/openai/agents/openai-agents-runner.ts`.
2. Replace the unsafe cast with safe optional access:

```typescript
const traceId: string | undefined =
  typeof (runResult as Record<string, unknown>)?.traceId === "string"
    ? (runResult as Record<string, unknown>).traceId as string
    : undefined;
```

3. Or better: check if the official SDK exports a trace ID accessor and use that. If not, document the workaround with a `@todo` for future SDK versions.
4. Add unit test: function does not throw when `traceId` is missing.

---

#### Commit 5.1.5 — Fix undefined access in `parseMoveAllType`

**Sub-tasks:**

1. Open `src/features/ai/commands/deterministic-command-planner.ts`.
2. Change `match[1].toLowerCase()` to:

```typescript
const typeStr = match[1];
if (!typeStr) return null;
return typeStr.toLowerCase();
```

3. Add unit test: regex that doesn't capture group 1 returns null instead of throwing.

---

### Branch 5.2: `refactor/ai-planner-decomposition`

**Related audit issues:** CQ-02, CQ-12

#### Commit 5.2.1 — Split deterministic planner into command modules

**Sub-tasks:**

1. Create directory `src/features/ai/commands/planners/`.
2. Extract creation commands into `planners/create-commands.ts`:
   - `planCreateSticky`, `planCreateStickyBatch`, `planCreateFrame`, `planCreateShape`, `planCreateStickyGrid`.
3. Extract layout commands into `planners/layout-commands.ts`:
   - `planArrangeInGrid`, `planAlignSelected`, `planDistributeSelected`.
4. Extract manipulation commands into `planners/manipulation-commands.ts`:
   - `planMoveSelected`, `planMoveAll`, `planResizeSelected`, `planChangeColorSelected`, `planUpdateSelectedText`.
5. Extract template commands into `planners/template-commands.ts`:
   - `planCreateSwot`, `planCreateJourneyMap`, `planCreateRetrospective`.
6. Each module exports pure functions that accept parsed input and return a `ToolCallPlan[]`.

**SOLID alignment:** Single Responsibility — each module handles one category. Open/Closed — new commands are added as new modules, not by editing existing ones.

---

#### Commit 5.2.2 — Extract parser utilities into `parsers/` module

**Sub-tasks:**

1. Create `src/features/ai/commands/parsers/`.
2. Move `parseColorKeyword`, `parsePosition`, `parseDimensions`, `parseMoveAllType`, `parseMoveDirection`, `parseCount` and all regex-based parsing functions into `parsers/command-parsers.ts`.
3. Move `normalizeMessage`, `extractObjectTypeHints`, `extractColorHints` into `parsers/message-normalizer.ts`.
4. Update imports in all planner modules.

---

#### Commit 5.2.3 — Slim down `deterministic-command-planner.ts` to router

**Sub-tasks:**

1. The main file should now only contain the `planDeterministicCommand` function that:
   - Normalizes the message
   - Tries each planner module in priority order
   - Returns the first successful plan, or null
2. Target: under 200 lines.
3. Run existing AI E2E tests to verify no regression.

---

#### Commit 5.2.4 — Replace module-level singletons with dependency injection

**Sub-tasks:**

1. Refactor `guardrails.ts`: instead of `let store: GuardrailStore | null = null`, accept the store as a parameter to `checkUserRateLimit` and `acquireBoardCommandLock`.
2. Refactor `openai-cost-controls.ts`: accept the spend store as a parameter to `reserveBudget`, `releaseBudget`, `finalizeBudget`.
3. Create factory functions that wire the default implementations:

```typescript
/**
 * Creates a guardrails instance backed by the configured store.
 *
 * @returns Guardrails interface with rate limit and lock functions
 */
export function createGuardrails(): Guardrails {
  const store = process.env.AI_GUARDRAIL_STORE === "firestore"
    ? createFirestoreGuardrailStore()
    : createMemoryGuardrailStore();
  return {
    checkUserRateLimit: (uid) => checkUserRateLimit(uid, store),
    acquireBoardLock: (boardId) => acquireBoardCommandLock(boardId, store),
  };
}
```

4. Remove `setXForTests()` functions — tests now pass mock stores directly.
5. Update the AI board-command route to use the factory.

**SOLID alignment:** Dependency Inversion — business logic depends on abstractions (store interfaces), not concrete implementations. Single Responsibility — factory functions handle wiring.

---

## 8. EPIC 6: Type Safety and DRY Consolidation

**As a** developer, **I want** shared types, consolidated utilities, and eliminated duplication **so that** changes propagate correctly and the codebase is smaller.

**Priority:** MEDIUM.
**Estimated effort:** 6–8 hours.

---

### Branch 6.1: `refactor/type-safety-and-shared-modules`

**Related audit issues:** CQ-05, CQ-06, CQ-07, CQ-15, BUG-16, BUG-18

#### Commit 6.1.1 — Introduce discriminated union for `BoardObject`

**Sub-tasks:**

1. Open `src/features/boards/types.ts`.
2. Define per-kind interfaces:

```typescript
interface BaseBoardObject {
  id: string;
  zIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationDeg: number;
  color: string;
  text: string;
  updatedAt: string | null;
}

interface StickyNoteObject extends BaseBoardObject {
  type: "sticky";
}

interface ConnectorObject extends BaseBoardObject {
  type: "connectorArrow" | "connectorUndirected" | "connectorBidirectional";
  fromObjectId: string;
  toObjectId: string;
  fromAnchor: ConnectorAnchor;
  toAnchor: ConnectorAnchor;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface GridContainerObject extends BaseBoardObject {
  type: "gridContainer";
  gridRows: number;
  gridCols: number;
  gridGap: number;
  gridCellColors: string[];
  containerTitle: string;
  gridSectionTitles: string[];
  gridSectionNotes: string[];
}

export type BoardObject = StickyNoteObject | ConnectorObject | GridContainerObject | ...;
```

3. Add type guard functions: `isConnector(obj)`, `isGridContainer(obj)`, etc.
4. Update consumers to use type narrowing instead of nullable field access.
5. This is a large change — run all tests after each sub-type migration.

---

#### Commit 6.1.2 — Extract shared color palette module

**Sub-tasks:**

1. Create `src/features/boards/lib/color-palette.ts`:

```typescript
/**
 * Canonical color palette shared across the board canvas,
 * AI tools, and deterministic planner.
 */
export const STICKY_PALETTE: Record<string, string> = {
  yellow: "#fef08a",
  pink: "#fda4af",
  blue: "#93c5fd",
  green: "#86efac",
  purple: "#c4b5fd",
  orange: "#fdba74",
  red: "#fca5a5",
  white: "#ffffff",
};

export const COLOR_KEYWORDS: Record<string, string> = {
  ...STICKY_PALETTE,
  cyan: "#67e8f9",
  teal: "#5eead4",
  gray: "#d1d5db",
  grey: "#d1d5db",
};

/**
 * Maps any color keyword or hex string to the nearest palette color.
 *
 * @param input - Color keyword or hex string
 * @returns Hex color string from the palette
 */
export function toNearestPaletteColor(input: string): string { ... }
```

2. Update all consumers: `deterministic-command-planner.ts`, `board-tools.ts`, `message-intent-hints.ts`.
3. Delete the duplicated color maps.

---

#### Commit 6.1.3 — Consolidate duplicated utility functions

**Sub-tasks:**

1. Create `src/lib/shared-utils.ts` for truly cross-cutting utilities:
   - `roundUsd(value: number): number`
   - `getErrorMessage(error: unknown): string`

2. Create `src/features/boards/lib/geometry-utils.ts` for board-specific math:
   - `getDistance(a: Point, b: Point): number`
   - `roundToStep(value: number, step: number): number`
   - `segmentIntersectsBounds(segment, bounds): boolean`
   - `isConnectorKind(type: string): boolean`

3. Create `src/server/api/env-helpers.ts` for server-side env utilities:
   - `parseRequiredFlag(value: string | undefined): boolean`
   - `getInternalMcpToken(): string | undefined`
   - `isE2eRouteEnabled(): boolean`

4. Update all consumers to import from the canonical locations.
5. Delete all duplicate definitions.

---

#### Commit 6.1.4 — Separate Firebase auth and Firestore initialization

**Sub-tasks:**

1. Open `src/lib/firebase/client.ts`.
2. Split `getFirebaseClientAuth()` so it does not initialize Firestore as a side effect.
3. Create separate `getFirebaseClientDb()` function that handles its own emulator connection.
4. Ensure each function is idempotent and free of cross-concerns.

---

#### Commit 6.1.5 — Fix `getPointSequenceBounds` empty array crash

**Sub-tasks:**

1. Open `src/features/boards/components/realtime-canvas/connector-routing-geometry.ts`.
2. Add early return:

```typescript
if (points.length === 0) {
  return { left: 0, top: 0, right: 0, bottom: 0 };
}
```

3. Add unit test: empty array returns zero bounds.

---

#### Commit 6.1.6 — Replace deprecated `execCommand("copy")` fallback

**Sub-tasks:**

1. Open `src/features/boards/lib/board-share.ts`.
2. Remove the `document.execCommand("copy")` fallback.
3. Keep only the `navigator.clipboard.writeText()` path with proper error handling:

```typescript
try {
  await navigator.clipboard.writeText(url);
} catch {
  throw new Error("Clipboard access denied. Please copy the URL manually.");
}
```

---

### Branch 6.2: `refactor/e2e-helpers-consolidation`

**Related audit issues:** CQ-08, BUG-15

#### Commit 6.2.1 — Create shared E2E helpers module

**Sub-tasks:**

1. Create `e2e/helpers/board-helpers.ts` with shared functions:
   - `createBoardAndOpen(page)`
   - `ensureAiInputVisible(page)`
   - `sendAiCommand(page, command)`
   - `getBoardObjects(page)`
   - `addManualStickyNotes(page, count)`
   - `addManualRectangles(page, count)`
   - `getBoardObjectBox(page, index)`
   - `selectFirstObjectCount(page, count)`

2. Create `e2e/helpers/auth-helpers.ts`:
   - `sanitizeUserKey(email)`
   - `createUserIdentity(testId)`
   - `loginWithEmulator(page, identity)`

3. Create `e2e/helpers/constants.ts`:
   - `LANGFUSE_DASHBOARD_URL`
   - Other shared constants

---

#### Commit 6.2.2 — Update all E2E specs to use shared helpers

**Sub-tasks:**

1. Update each E2E spec file to import from `e2e/helpers/`.
2. Delete the duplicated inline helper functions.
3. Run the full E2E suite to verify no regressions.

---

#### Commit 6.2.3 — Fix E2E test/route method mismatch

**Sub-tasks:**

1. Update the `waitForResponse` filters in `ai-agent-call-matrix-openai-nano.spec.ts`, `ai-required-capabilities-openai.spec.ts`, and `ai-agent-call-matrix-fallback.spec.ts` to match `GET` instead of `POST` (matching the actual route handler).
2. Alternatively, change `src/app/api/e2e/custom-token/route.ts` to export a `POST` handler (since token minting is a state-changing operation — better REST semantics).
3. If changing to POST, update the E2E `loginWithEmulator` helper to use `method: "POST"`.

---

## 9. EPIC 7: UI/UX Polish and Theming

**As a** user, **I want** consistent styling, dark mode support, and accessible interactions **so that** the app feels polished and professional.

**Priority:** LOW.
**Estimated effort:** 6–8 hours.

---

### Branch 7.1: `refactor/ui-component-improvements`

**Related audit issues:** CQ-04, CQ-09, CQ-10, CQ-14

#### Commit 7.1.1 — Decompose `GridContainer` component

**Sub-tasks:**

1. Extract `src/features/ui/components/grid-dimension-picker.tsx`:
   - Handles the row/column drag-selection UI.
   - Props: `{ rows, cols, maxRows, maxCols, onChange }`.

2. Extract `src/features/ui/components/cell-color-picker.tsx`:
   - Handles color swatch selection per grid cell.
   - Props: `{ currentColor, palette, onChange }`.

3. Extract `src/features/ui/components/editable-title.tsx`:
   - Reusable inline-edit title component (used for both container titles and section titles).
   - Props: `{ value, onCommit, placeholder, className }`.

4. Slim down `GridContainer` to compose these sub-components.
5. Target: under 300 lines for `GridContainer`.

---

#### Commit 7.1.2 — Migrate board workspace inline styles to Tailwind

**Sub-tasks:**

1. Open `src/features/boards/components/board-workspace.tsx`.
2. Replace inline `style` objects with Tailwind utility classes.
3. Extract repeated color values into CSS custom properties in `globals.css`.
4. Same treatment for `board-settings-workspace.tsx`.

---

#### Commit 7.1.3 — Add dark mode support to UI components

**Sub-tasks:**

1. For each component in `src/features/ui/components/` (`button`, `input`, `card`, `badge`, `icon-button`, `section-heading`):
   - Add `dark:` variant classes matching the existing CSS custom properties from the theme.
   - Example: `bg-white` → `bg-white dark:bg-slate-900`, `text-slate-900` → `text-slate-900 dark:text-slate-100`.
2. Verify the `ThemeProvider` correctly sets the `dark` class on `<html>`.
3. Visually test both themes.

---

#### Commit 7.1.4 — Replace `window.prompt()` with modal dialog

**Sub-tasks:**

1. Create `src/features/ui/components/prompt-dialog.tsx`:
   - A modal dialog with text input, confirm, and cancel buttons.
   - Props: `{ title, defaultValue, onConfirm, onCancel, isOpen }`.

2. Replace `window.prompt("Rename board", board.title)` in `board-workspace.tsx` with the new dialog component.
3. Add unit test for the dialog: confirm returns value, cancel returns null.

---

### Branch 7.2: `fix/jsdoc-overhaul`

**Related audit issues:** CQ-11

#### Commit 7.2.1 — Rewrite JSDoc for AI feature modules

**Sub-tasks:**

1. For each file in `src/features/ai/`:
   - Replace every `/** Handles X. */` with a meaningful description.
   - Add `@param`, `@returns`, `@throws` tags to all exported functions.
   - Include a module-level JSDoc comment explaining the module's purpose.
2. Prioritize public-facing functions and types. Internal helpers can have briefer docs.

---

#### Commit 7.2.2 — Rewrite JSDoc for board feature modules

**Sub-tasks:**

1. Same treatment for `src/features/boards/`, `src/features/auth/`, `src/features/ui/`, `src/features/layout/`, `src/features/theme/`.
2. Focus on hooks and components that other developers would consume.

---

#### Commit 7.2.3 — Rewrite JSDoc for server and lib modules

**Sub-tasks:**

1. Same treatment for `src/server/`, `src/lib/`, and API route files.
2. Document error response shapes, authentication requirements, and rate limits in route-level JSDoc.

---

## 10. EPIC 8: Testing and CI

**As a** developer, **I want** comprehensive test coverage and CI automation **so that** regressions are caught before merge.

**Priority:** MEDIUM.
**Estimated effort:** 8–10 hours.

---

### Branch 8.1: `feature/unit-test-coverage`

**User story:** As a developer, I want unit tests for all critical logic so that I can refactor with confidence.

#### Commit 8.1.1 — Add tests for extracted canvas hooks

**Sub-tasks:**

1. `use-canvas-viewport.test.ts` — test zoom bounds, screenToCanvas transform, wheel handler.
2. `use-marquee-selection.test.ts` — test rectangle intersection, additive/subtractive selection.
3. `use-keyboard-shortcuts.test.ts` — test shortcut registration, callback firing, disabled state.
4. `use-object-drag.test.ts` — test throttle, container drag writes, snap-to-grid.
5. Use `@testing-library/react` `renderHook` for hook testing.

---

#### Commit 8.1.2 — Add tests for auth and theme

**Sub-tasks:**

1. `use-auth-session.test.ts` — test loading state, sign-in success, popup error handling, sign-out.
2. `theme-provider.test.tsx` — test mode switching, localStorage persistence, system preference.
3. Mock Firebase Auth and window.matchMedia.

---

#### Commit 8.1.3 — Add tests for UI components

**Sub-tasks:**

1. `button.test.tsx` — test variants, disabled state, click handler.
2. `input.test.tsx` — test onChange, placeholder, disabled.
3. `card.test.tsx` — test rendering, children.
4. `grid-dimension-picker.test.tsx` — test clamping, drag selection.
5. `editable-title.test.tsx` — test commit on blur, commit on Enter.

---

#### Commit 8.1.4 — Add tests for connector routing geometry

**Sub-tasks:**

1. `connector-routing-geometry.test.ts`:
   - Test `getPointSequenceBounds` with various inputs (empty, single point, multi-point).
   - Test route scoring functions.
   - Test segment-bounds intersection.
2. Cover the edge cases identified in BUG-16.

---

### Branch 8.2: `feature/e2e-coverage-expansion`

**User story:** As a QA engineer, I want E2E tests covering sharing, deletion, and multi-user scenarios so that critical flows are verified.

#### Commit 8.2.1 — Add multi-browser E2E configuration

**Sub-tasks:**

1. Open `playwright.config.ts`.
2. Add Firefox and WebKit projects:

```typescript
projects: [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  { name: "firefox", use: { ...devices["Desktop Firefox"] } },
  { name: "webkit", use: { ...devices["Desktop Safari"] } },
],
```

3. Run existing tests across all three browsers to identify cross-browser issues.

---

#### Commit 8.2.2 — Add sharing flow E2E test

**Sub-tasks:**

1. Create `e2e/board-sharing.spec.ts`.
2. Test: User A creates board → shares with User B as editor → User B can edit → User A revokes → User B can no longer edit.
3. Use Firebase emulator auth for both users.

---

#### Commit 8.2.3 — Add board deletion E2E test

**Sub-tasks:**

1. Create `e2e/board-deletion.spec.ts`.
2. Test: create board → add objects → delete board → verify board no longer accessible → verify objects subcollection cleaned up.

---

#### Commit 8.2.4 — Add multi-user collaboration E2E test

**Sub-tasks:**

1. Create `e2e/multi-user-collab.spec.ts`.
2. Use two browser contexts (Playwright supports this).
3. Test: User A and User B both open the same board → User A creates a sticky → User B sees it → User B moves it → User A sees the new position.
4. Test: Both users' cursors are visible to each other.

---

## 11. EPIC 9: Performance Optimization

**As a** user, **I want** the board to maintain 60 FPS with 500+ objects **so that** the experience is smooth even on large boards.

**Priority:** MEDIUM (important for requirements compliance but architecturally complex).
**Estimated effort:** 6–8 hours.

---

### Branch 9.1: `feature/performance-optimization`

**Related audit issues:** BUG-02, performance targets

#### Commit 9.1.1 — Implement spatial index for connector routing

**Sub-tasks:**

1. Create `src/features/boards/lib/spatial-index.ts`:

```typescript
/**
 * Simple grid-based spatial index for fast rectangular overlap queries.
 * Used by connector routing to avoid O(n) obstacle scans.
 *
 * @param cellSize - Grid cell size in canvas units (default 200)
 */
export class SpatialGrid {
  constructor(private cellSize: number = 200) {}

  /**
   * Inserts an object's bounding box into the grid.
   *
   * @param id - Object identifier
   * @param bounds - Object bounding rectangle
   */
  insert(id: string, bounds: Rect): void { ... }

  /**
   * Queries all object IDs whose bounding boxes overlap the given rectangle.
   *
   * @param queryBounds - Rectangle to query
   * @returns Set of overlapping object IDs
   */
  query(queryBounds: Rect): Set<string> { ... }

  clear(): void { ... }
}
```

2. Build the spatial grid once per render frame (O(n)), then query per connector route (O(k) where k is nearby objects).
3. This reduces connector routing from O(n²·m) to O(n + m·k) where k << n.

---

#### Commit 9.1.2 — Limit connector routing to visible viewport

**Sub-tasks:**

1. In the connector routing `useMemo`, filter connectors to only those where at least one endpoint is visible in the current viewport.
2. Off-screen connectors get a simple straight-line fallback (no obstacle avoidance).
3. As the user pans, newly visible connectors get properly routed on the next frame.

---

#### Commit 9.1.3 — Debounce connector routing separately from render

**Sub-tasks:**

1. Move connector route computation to a `useEffect` with a 32ms debounce (approximately 30 FPS for route updates).
2. Cache the last computed routes in a ref.
3. The render reads from the cache, so frame rate is decoupled from routing compute time.
4. This ensures pan/zoom stays at 60 FPS even if routing is expensive.

---

### Branch 9.2: `feature/viewport-virtualization`

**User story:** As a user, I want boards with 500+ objects to render smoothly by only mounting visible DOM nodes.

#### Commit 9.2.1 — Implement viewport-based object culling

**Sub-tasks:**

1. In the canvas render section, compute the visible viewport rectangle in canvas coordinates.
2. Add a padding buffer (e.g., 200px in canvas units) to prevent pop-in during fast panning.
3. Filter `objects` to only those whose bounding box intersects the padded viewport.
4. Only render these visible objects as DOM nodes.
5. This reduces DOM node count from N to the number visible (~50–100 even on large boards).

---

#### Commit 9.2.2 — Add `noUncheckedIndexedAccess` to TypeScript config

**Sub-tasks:**

1. Open `tsconfig.json`.
2. Add `"noUncheckedIndexedAccess": true` to `compilerOptions`.
3. Fix all resulting type errors (array[n] now returns `T | undefined` — add null checks where needed).
4. This is a quality improvement that catches a class of runtime errors at compile time.

---

## 12. Overall Recommendations

### CI/CD Integration

1. **Add a GitHub Actions workflow** that runs on every PR:
   - `npm run lint` — ESLint + TypeScript type checking
   - `npm run test` — Vitest unit tests
   - `npm run build` — Production build verification
   - `npm run test:e2e` — Playwright E2E tests (Chromium at minimum)

2. **Add Firestore rules testing** using the Firebase Emulator Suite and `@firebase/rules-unit-testing` to verify security rules.

3. **Add `npm audit`** to CI to catch dependency vulnerabilities.

4. **Add branch protection** on `main`: require passing CI, at least one review.

### Code Review Practices

1. **No PR should exceed 500 lines of changes** (excluding auto-generated files). The canvas decomposition PRs will be large but can be split across two branches as planned.

2. **Every PR that adds a feature should include tests** for that feature.

3. **Security-sensitive PRs** (EPIC 1) should be reviewed by a second pair of eyes with security awareness.

### Architecture Monitoring

1. **Add a file size linter rule** (e.g., max 500 lines per file) to prevent future god components.

2. **Consider ESLint `max-lines` rule** set to 500 as a warning, 1000 as an error.

3. **Track the number of `useRef`s per component** — more than 5 is a code smell indicating the component needs decomposition.

---

## 13. Timeline Estimate

### Assumptions

- Single developer working full-time
- Familiar with the codebase
- AI-assisted development (2–3x productivity multiplier on boilerplate)
- No blockers on environment setup

### Phase Schedule

| Phase | Days | EPICs | Key Milestones |
|---|---|---|---|
| **Phase 1 — Critical** | Days 1–2 | 1 (Security), 2 (Features) | All HIGH security issues fixed, missing features implemented |
| **Phase 2 — Structural** | Days 2–4 | 3 (Canvas), 4 (API), 5 (AI) | Canvas under 1,500 lines, all race conditions fixed, AI bugs resolved |
| **Phase 3 — Quality** | Days 4–6 | 6 (DRY), 7 (UI/UX) | Duplications eliminated, dark mode working, JSDoc meaningful |
| **Phase 4 — Hardening** | Days 6–7 | 8 (Testing), 9 (Performance) | 80%+ critical-path coverage, 60 FPS with 500 objects |

### Branch Merge Order

Branches should be merged in this order to minimize conflicts:

```
1. fix/e2e-route-security
2. fix/firestore-rules-hardening
3. fix/input-validation-and-sanitization
4. fix/api-security-misc
5. feature/missing-board-features
6. feature/collaboration-resilience
7. refactor/canvas-decomposition-phase-1
8. refactor/canvas-decomposition-phase-2
9. fix/api-race-conditions-and-cascades
10. fix/api-route-decomposition
11. fix/auth-error-handling
12. fix/ai-agent-bugs
13. refactor/ai-planner-decomposition
14. refactor/type-safety-and-shared-modules
15. refactor/e2e-helpers-consolidation
16. refactor/ui-component-improvements
17. fix/jsdoc-overhaul
18. feature/unit-test-coverage
19. feature/e2e-coverage-expansion
20. feature/performance-optimization
21. feature/viewport-virtualization
```

### Expected Outcome

After completing all phases, the project should score approximately **8.5–9.0 / 10** (up from 6.2), with:

- Full requirements compliance (0 missing features)
- No high-severity security issues
- No files over 1,500 lines
- 80%+ test coverage on critical paths
- 60 FPS with 500+ objects
- Meaningful documentation on all public APIs
- Consistent theming with dark mode support

---

*End of Action Plan*
