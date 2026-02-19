# CollabBoard

A realtime multi-user whiteboard.

Built with Next.js and Firebase Firestore.

## Deployed Live

- Firebase App Hosting: [https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/)
- Vercel: [https://gauntlet-1-collab-board.vercel.app/](https://gauntlet-1-collab-board.vercel.app/)

## Build And Run Locally

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
npm run lint
npm run typecheck
npm run build
```

Playwright first-run setup:

```bash
npx playwright install chromium
```

Styleguide route (component library preview in app):

- `http://localhost:3000/styleguide`

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
- ✅ Runtime MCP integration (in-app Streamable HTTP endpoint)
- ✅ Local fallback template provider if MCP call fails/times out
- ✅ Server-side board tool executor (create/move/resize/update/color/get state)
- ✅ End-to-end trace spans through Langfuse (when configured)

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
- `tool.execute`
- `board.write.commit`
- `ai.response.sent` (final trace update)

Guardrails:

- Max operations per command
- Max created objects per command
- Per-user rate limiting window
- Per-board command lock to avoid conflicting concurrent AI runs
- MCP timeout and overall route timeout

Env notes:

- OpenAI key is **not** required for this phase.
- To enable internal MCP auth + Langfuse tracing in deployed environments:
  - `MCP_INTERNAL_TOKEN`
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - optional: `LANGFUSE_BASE_URL`
  - optional: `AI_AUDIT_LOG_ENABLED=true` (writes `boards/{boardId}/aiRuns/*`)

## In Progress Features

- 🛠️ Better testing

## Features Not Added For MVP

- 🚧 Email and password sign-on
- 🚧 GitHub Auth
- 🚧 AI agent assistance
- 🚧 Advanced automated test coverage
