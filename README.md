# CollabBoard

A realtime multi-user whiteboard.

Built with Next.js and Firebase Firestore.

## Deployed Live

- Firebase App Hosting: [https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/)
- Vercel: [https://gauntlet-1-collab-board.vercel.app/](https://gauntlet-1-collab-board.vercel.app/)

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
npm run storybook
npm run build-storybook
npm run test
npm run test:e2e
npm run test:e2e:emulator
npm run lint
npm run typecheck
npm run docs:api
npm run build
```

Playwright first-run setup:

```bash
npx playwright install chromium
```

Firebase emulator e2e (no paid Firebase usage):

```bash
npm run test:e2e:emulator
```

Java is required for emulator-backed scripts:

- `npm run firebase:emulators`
- `npm run test:e2e:emulator`
- `npm run test:e2e:ai-agent-calls:fallback`
- `npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID`

Styleguide route (component library preview in app):

- `http://localhost:3000/styleguide`

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

Langfuse spans:

- `ai.request.received`
- `mcp.call`
- `openai.budget.reserve`
- `openai.call`
- `tool.execute`
- `tool.execute.call`
- `board.write.commit`
- `ai.response.sent`

Guardrails:

- max operations per command
- max created objects per command
- per-tool limits (`createStickyBatch`, layout tools, `moveObjects`, `deleteObjects`)
- per-user rate limiting window
- per-board command lock
- route timeout

Env notes:

- Required for tracing:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - optional `LANGFUSE_BASE_URL`
- Required for OpenAI planner:
  - `AI_ENABLE_OPENAI=true`
  - `AI_PLANNER_MODE=openai-strict` (recommended for happy path)
  - `OPENAI_RUNTIME=agents-sdk` (default; direct tool-calling path)
  - `OPENAI_API_KEY=...`
  - optional `OPENAI_MODEL=gpt-4.1-nano`
  - optional `OPENAI_AGENTS_MAX_TURNS=8`
  - optional `OPENAI_AGENTS_TRACING=true`
  - optional `OPENAI_AGENTS_WORKFLOW_NAME=collabboard-command`
  - optional `OPENAI_RESERVE_USD_PER_CALL=0.003`
  - optional `AI_GUARDRAIL_STORE=memory|firestore`
- hard app-level spend guardrail: `$10.00`

On-demand AI test suites:

- Fallback matrix (20 commands, no paid LLM):
  - `npm run test:e2e:ai-agent-calls:fallback`
- OpenAI matrix (20 paid commands, strict mode):
  - `npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID`
  - legacy alias: `npm run test:e2e:ai-openai-smoke:nano:PAID`

Naming convention:

- Any npm script that can spend paid model tokens ends with `:PAID`.

## In Progress Features

- 🛠️ Better testing

## Features Not Added For MVP

- 🚧 Email and password sign-on
- 🚧 GitHub Auth
- 🚧 AI agent assistance
- 🚧 Advanced automated test coverage
