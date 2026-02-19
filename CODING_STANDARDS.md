# Coding Standards

This document defines baseline engineering standards for this repository.

## Scope

These standards apply to all production code, tests, scripts, and API route handlers in this repository.

## 1. Documentation Standard

1. Every named function must include JSDoc.
2. Every class method and constructor must include JSDoc.
3. JSDoc must include a meaningful one-line description.
4. Anonymous inline callbacks are exempt when they are not named declarations.

### Enforced By

- ESLint rules in `/Users/patrick/Code/gauntlet/1-collab-board/eslint.config.mjs`.
- Auto-annotation helper: `npm run jsdoc:add`.

## 2. API Documentation Generation

Generate API docs from TypeScript source with:

```bash
npm run docs:api
```

Output is written to:

- `/Users/patrick/Code/gauntlet/1-collab-board/docs/api`

Configuration file:

- `/Users/patrick/Code/gauntlet/1-collab-board/typedoc.json`

## 3. TypeScript and Linting

1. `strict` mode stays enabled.
2. `npm run typecheck` must pass before merge.
3. `npm run lint` must pass before merge.

## 4. Testing

1. `npm run test` must pass before merge.
2. For interaction-sensitive changes, include Playwright e2e coverage.
3. Tests should assert behavior, not implementation detail.

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
