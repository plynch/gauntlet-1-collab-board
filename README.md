# CollabBoard

A realtime multi-user whiteboard.

Built with Next.js and Firebase Firestore.

## Deployed Live

- Firebase App Hosting: [https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/)

## Build And Run Locally

Prerequisites:

- Node.js and npm
- Java 21+ (required for Firebase emulator-backed workflows)

Verify local toolchain:

```bash
node -v && npm -v && java -version
```

1. Install dependencies:

```bash
npm install
```

2. Add Firebase environment variables in `.env.local` (see `.env.example`).

3. For no-paid local development, enable strict Firestore emulator mode in `.env.local`:

```bash
NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true
NEXT_PUBLIC_USE_AUTH_EMULATOR=false
NEXT_PUBLIC_DEV_REQUIRE_FIRESTORE_EMULATOR=true
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
DEV_REQUIRE_FIRESTORE_EMULATOR=true
```

4. Start emulators (Terminal 1):

```bash
npm run firebase:emulators
```

5. Start app (Terminal 2):

```bash
npm run dev
```

6. Open:
   `http://localhost:3000`

Useful scripts:

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
npm run secrets:sync:apphosting
```

## Coding Standards

- Project coding standards: `/Users/patrick/Code/gauntlet/1-collab-board/CODING_STANDARDS.md`
- JSDoc is required for named functions and class methods in source files.
- To auto-add missing JSDoc blocks:

```bash
npm run jsdoc:add
```

## API Documentation

Generate API docs from TypeScript comments:

```bash
npm run docs:api
```

Generated docs location:

- `/Users/patrick/Code/gauntlet/1-collab-board/docs/api`

## Current Features

- ✅ Infinite board with pan/zoom
- ✅ Sticky notes with editable text
- ✅ Shapes!
- ✅ Move and edit objects!
- ✅ Real-time sync between multiple users!
- ✅ Multiplayer cursors!
- ✅ Who's Online!
- ✅ User authentication! (Google only, more coming later)
- ✅ Deployed and publicly accessible

## Runtime AI Agent

Implemented capabilities:

- ✅ OpenAI Agents SDK runtime integration (`@openai/agents`, `gpt-4.1-nano`)
- ✅ Runtime backend switch: `OPENAI_RUNTIME=agents-sdk|chat-completions` (default `agents-sdk`)
- ✅ Planner modes: `openai-strict`, `openai-with-fallback`, `deterministic-only`
- ✅ Deterministic planner support for key creation/manipulation/layout/template commands
- ✅ High-level bulk tools for reliability (`createStickyBatch`, `moveObjects`, `fitFrameToContents`)
- ✅ Extended layout tools (`arrangeObjectsInGrid`, `alignObjects`, `distributeObjects`)
- ✅ Server-side tool execution with batched writes where possible
- ✅ End-to-end Langfuse tracing, including per-tool spans
- ✅ Cost guardrails with reservation-per-call and hard spend cap

Docs:

- User guide: `AI-AGENT-USER-GUIDE.md`
- Tool schema reference: `docs/ai/TOOL_SCHEMA_REFERENCE.md`
- Command catalog: `docs/ai/COMMAND_CATALOG.md`
- Architecture overview: `docs/architecture/AI_SYSTEM_OVERVIEW.md`
- Live test + tracing runbook: `docs/runbooks/AI_LIVE_TESTING_AND_LANGFUSE.md`

Runtime flow:

1. Board chat drawer submits to `POST /api/ai/board-command`.
2. Route authenticates, checks board permissions, and applies guardrails.
3. OpenAI runtime backend is selected by `OPENAI_RUNTIME`.
4. In `agents-sdk` mode, OpenAI agent tools execute board operations directly in-route.
5. In `chat-completions` mode, legacy planner generates a structured operation plan.
6. Planner mode (`AI_PLANNER_MODE`) still controls strict/fallback/deterministic behavior.
7. Response returns assistant message + execution summary + trace ID.

## Golden Evals (Manual Acceptance)

Run these commands in the AI drawer as the canonical live QA set.

Important selection prerequisites:
- Commands using "these/elements" require manual multi-select first.
- `Arrange these sticky notes in a grid` requires at least 2 selected objects.
- `Space these elements evenly` requires at least 3 selected objects.
- Sticky colors (red/pink/yellow) are matched to the closest app palette colors.

Suggested execution order:
`1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12`

1. `Add a yellow sticky note that says 'User Research'`
Expected result: exactly one new sticky is created with text `User Research` and yellow-family palette color.

2. `Create a blue rectangle at position 100,200`
Expected result: exactly one blue rectangle is created near x=100, y=200.

3. `Add a frame called "Sprint Planning"`
Expected result: exactly one frame is created with title `Sprint Planning`.

4. `Create 5 pink sticky notes`
Expected result: five new pink stickies are created.

5. `Create 5 blue sticky notes`
Expected result: five new blue stickies are created.

6. `Move all the pink sticky notes to the right side`
Expected result: pink stickies shift right (x increases) while other stickies remain in place.

7. `Arrange these sticky notes in a grid`
Expected result: selected stickies are repositioned into a grid pattern (not a no-op).

8. `Create a 2x3 grid of sticky notes for pros and cons`
Expected result: six stickies are created in a 2x3 layout with `pros and cons`-style seeded text.

9. `Space these elements evenly`
Expected result: selected elements are redistributed with even spacing along an inferred axis.

10. `Create a SWOT analysis template with four quadrants`
Expected result: one 2x2 SWOT container appears with quadrant labels (`Strengths`, `Weaknesses`, `Opportunities`, `Threats`).

11. `Build a user journey map with 5 stages`
Expected result: one journey-map frame with five stage stickies appears.

12. `Set up a retrospective board with What Went Well, What Didn't, and Action Items columns`
Expected result: one retrospective frame appears with the three named columns.

AI evaluation script:

- `npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID` (20-command happy-path matrix)
- Any paid AI command script ends with `:PAID`.

## Rejected / Not Priority

- 🚫 Email and password sign-on
- 🚫 GitHub Auth
