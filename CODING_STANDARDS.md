# Coding Standards

This document defines baseline engineering standards for this repository.

## Scope

These standards apply to production code, tests, scripts, and API route handlers.

## 1. File Size and Modularity

1. Keep files small so humans and AI agents can reason about them quickly.
2. Target max file size: `<= 400` lines for new files.
3. Soft limit: `> 600` lines requires a split plan in the same PR notes.
4. Hard limit: `> 800` lines is blocked unless the change is a short-lived emergency fix.
5. Break large files by behavior boundaries (hooks, helpers, UI subcomponents, route services).

## 2. Comments and Documentation

1. Do not add JSDoc boilerplate.
2. Use short inline comments only when code intent is not obvious.
3. Prefer clear naming, small functions, and focused modules over heavy comments.
4. Keep architecture and behavior docs in `docs/`, not inside large comment blocks.

## 3. TypeScript and Linting

1. `strict` mode stays enabled.
2. `npm run typecheck` must pass before merge.
3. `npm run lint` must pass before merge.

## 4. Testing

1. `npm run test` must pass before merge.
2. Any user-visible feature or behavior change must ship with unit tests in the same commit.
3. Any user-visible feature or behavior change must also ship with Playwright e2e coverage in the same commit.
4. If an e2e test is intentionally skipped or deferred, document the reason in PR notes and backlog before merge.
5. Tests should assert behavior, not implementation detail.

## 5. Commit and Review Quality

1. Keep changes scoped to one concern per commit when possible.
2. Include file-level and API-level impact in PR notes.
3. Do not merge code that reduces reliability of real-time collaboration behavior.

## 6. Security and Environment Hygiene

1. Never commit secrets or private keys.
2. Keep `.env*` local unless it is a sample file (`.env.example`).
3. Use emulator-backed local development for Firebase where practical.

## 7. Accessibility and UX Baselines

1. Interactive controls must have clear labels, tooltips, or aria labels.
2. Keyboard-accessible semantics are required for clickable non-native controls.
3. Keep visual state transitions predictable (selection, loading, disabled states).

## 8. Paid AI Command Naming

1. Any npm script that can spend paid model tokens must end with the exact suffix `:PAID`.
2. Paid scripts must fail fast with an actionable setup error when required credentials are missing.
3. New paid scripts must document expected spend behavior in `README.md`.
