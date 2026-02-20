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
- `npm run test:e2e:ai-openai-smoke:nano:PAID`

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

## Runtime AI Agent (Phase 1)

- ✅ Deterministic command routing for SWOT requests
- ✅ Deterministic command routing for create/move/resize/color/text commands
- ✅ Deterministic layout routing for arrange-grid, align-selected, and distribute-selected
- ✅ Deterministic sticky batch/grid prompts (`create 25 red stickies`, `create 2x3 sticky grid`)
- ✅ Deterministic insight prompts (`summarize selected notes`, `create action items from selected notes`)
- ✅ Runtime MCP integration (in-app Streamable HTTP endpoint)
- ✅ Local fallback template provider if MCP call fails/times out
- ✅ Server-side board tool executor (create/move/resize/update/color/get state)
- ✅ End-to-end trace spans through Langfuse (when configured)
- ✅ Optional OpenAI planner path (`gpt-4.1-nano`) with deterministic fallback and hard spend cap

User guide:

- `AI-AGENT-USER-GUIDE.md`

Architecture (current):

1. Board chat drawer sends command to `POST /api/ai/board-command`.
2. Route authenticates user, validates board permissions, applies guardrails.
3. Route calls internal MCP endpoint `POST /api/mcp/templates`:
   - `template.instantiate` for `swot.v1`
   - `command.plan` for deterministic object commands
4. MCP returns a structured template plan (operations list).
5. Route executes operations via server-side board tools, writing Firestore objects.
6. Response returns assistant message + execution metadata + `traceId`.

Langfuse coverage:

- `ai.request.received`
- `ai.intent.detected`
- `mcp.call`
- `openai.budget.reserve`
- `openai.call`
- `tool.execute`
- `board.write.commit`
- `ai.response.sent` (final trace update)

Guardrails:

- Max operations per command
- Max created objects per command
- Max layout object ids per layout tool call
- Per-user rate limiting window
- Per-board command lock to avoid conflicting concurrent AI runs
- MCP timeout and overall route timeout

Env notes:

- To enable internal MCP auth + Langfuse tracing in deployed environments:
  - `MCP_INTERNAL_TOKEN`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - optional: `LANGFUSE_BASE_URL`
  - optional: `AI_AUDIT_LOG_ENABLED=true` (writes `boards/{boardId}/aiRuns/*`)
- OpenAI planner is optional and off by default:
  - `AI_ENABLE_OPENAI=true`
  - `OPENAI_API_KEY=...`
  - optional: `OPENAI_MODEL=gpt-4.1-nano` (default)
  - optional: `OPENAI_RESERVE_USD_PER_CALL=0.003` (default reservation per call)
  - optional: `AI_GUARDRAIL_STORE=memory|firestore` (budget persistence backend)
  - hard app-level spend guardrail is capped at `$10.00`

On-demand AI trace suites:

- Fallback agent matrix (20 Playwright tests, one AI call per test, trace logging):
  - `npm run test:e2e:ai-agent-calls:fallback`
- OpenAI nano smoke matrix (strict + on-demand):
  - `npm run test:e2e:ai-openai-smoke:nano:PAID`

Naming convention:

- Any npm script that can spend paid model tokens ends with `:PAID`.

Fallback suite behavior:

- Forces `AI_ENABLE_OPENAI=false` so no paid LLM calls are used.
- Checks `/api/e2e/langfuse-ready` before running test cases and fails early when Langfuse is not configured server-side.
- Logs one line per test with case id, `traceId`, and dashboard URL:
  - `https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv`

Fallback trace runbook:

```bash
npm run test:e2e:ai-agent-calls:fallback
```

Expected trace log pattern in output:

```text
[langfuse-trace] case=case-01 traceId=<uuid> dashboard=https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv
```

OpenAI smoke suite behavior:

- Runs only in emulator mode and fails fast when server-side OpenAI config is not ready.
- Sets `AI_REQUIRE_OPENAI=true` so paid smoke fails immediately if OpenAI does not produce the plan.
- Validates `/api/e2e/langfuse-ready` and `/api/e2e/openai-ready` before paid calls.
- Executes two paid calls and asserts:
  - non-empty `traceId`
  - `provider=openai`
  - `mode=llm`

## In Progress Features

- 🛠️ Better testing

## Features Not Added For MVP

- 🚧 Email and password sign-on
- 🚧 GitHub Auth
- 🚧 AI agent assistance
- 🚧 Advanced automated test coverage
