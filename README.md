# 🧠 CollabBoard

Real-time collaborative whiteboard with an OpenAI-powered command drawer, deterministic fallbacks, and production-grade tracing.

## 📌 Quick Links

- 🌐 Live App: [https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/)
- 🚨 Audit Response (download): [AUDIT_RESPONSE.md](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/submission/AUDIT_RESPONSE.md)
- 🛠 Mitigation Status (download): [MITIGATIONS_RESPONSE.md](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/submission/MITIGATIONS_RESPONSE.md)
- 📄 AI Cost Analysis Markdown (download): [Download](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/submission/AI%20Cost%20Analysis%20-%20Collabboard.md)
- 📝 AI Development Log Markdown (download): [Download](https://collab-board-backend--gauntlet-1-collab-board.us-east5.hosted.app/submission/AI%20Development%20Log%20-%20Collabboard.md)
- 📂 Submission files in repo:
  - `public/submission/AUDIT_RESPONSE.md`
  - `public/submission/MITIGATIONS_RESPONSE.md`
  - `public/submission/AI Cost Analysis - Collabboard.md`
  - `public/submission/AI Development Log - Collabboard.md`
  - `public/submission/AI Cost Analysis - Collabboard - Google Docs.pdf`
  - `public/submission/AI Development Log - Google Docs.pdf`

## ✨ What CollabBoard Includes

- ✅ Infinite board with pan/zoom
- ✅ Sticky notes, shapes, frames, connectors
- ✅ Real-time multiplayer sync and presence
- ✅ AI command drawer with OpenAI + deterministic tooling
- ✅ Firebase-backed persistence and auth
- ✅ Tracing and budget guardrails for AI operations

## 🤖 AI Agent Capabilities

- ✅ OpenAI Agents SDK runtime (`@openai/agents`) with `gpt-4.1-nano`
- ✅ Runtime switch: `OPENAI_RUNTIME=agents-sdk|chat-completions` (default `agents-sdk`)
- ✅ Planner modes: `openai-strict`, `openai-with-fallback`, `deterministic-only`
- ✅ Bulk/high-level tools:
  - `createStickyBatch`
  - `createShapeBatch`
  - `moveObjects`
  - `arrangeObjectsInGrid`
  - `alignObjects`
  - `distributeObjects`
  - `fitFrameToContents`
- ✅ End-to-end tracing with Langfuse + OpenAI
- ✅ Cost controls (reserve-per-call + hard cap)

## 🧭 Golden Evals (Manual Acceptance)

Canonical command set to run in the AI drawer:

1. `Add a yellow sticky note that says 'User Research'`
2. `Create a blue rectangle at position 100,200`
3. `Add a frame called "Sprint Planning"`
4. `Create 5 pink sticky notes`
5. `Create 5 blue sticky notes`
6. `Move all the pink sticky notes to the right side`
7. `Arrange these sticky notes in a grid`
8. `Create a 2x3 grid of sticky notes for pros and cons`
9. `Space these elements evenly`
10. `Create a SWOT analysis template with four quadrants`
11. `Build a user journey map with 5 stages`
12. `Set up a retrospective board with What Went Well, What Didn't, and Action Items columns`

Selection prerequisites:

- Commands using `these/elements` require manual multi-select first.
- `Arrange ... in a grid` requires at least 2 selected objects.
- `Space ... evenly` requires at least 3 selected objects.

## 🚀 Local Development

Prerequisites:

- Node.js + npm
- Java 21+ (required for Firebase emulator-backed workflows)

Verify tools:

```bash
node -v && npm -v && java -version
```

Setup:

1. Install dependencies:

```bash
npm install
```

2. Add env vars to `.env.local` (see `.env.example`).

3. For local no-paid development, use emulator mode:

```bash
NEXT_PUBLIC_USE_FIRESTORE_EMULATOR=true
NEXT_PUBLIC_USE_AUTH_EMULATOR=false
NEXT_PUBLIC_DEV_REQUIRE_FIRESTORE_EMULATOR=true
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
DEV_REQUIRE_FIRESTORE_EMULATOR=true
```

4. Start emulators (terminal 1):

```bash
npm run firebase:emulators
```

5. Start app (terminal 2):

```bash
npm run dev
```

6. Open `http://localhost:3000`

## 🧪 Scripts

Core:

```bash
npm run dev
npm run build
npm run test
npm run lint
npm run typecheck
```

E2E / AI:

- `npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID`
- `npm run test:e2e:ai-required-capabilities:openai-agents:nano:PAID`
- Paid AI scripts end with `:PAID`.

Operations:

- `npm run secrets:sync:apphosting`
- `npm run docs:api`

## 🔍 Tracing & Observability

- Langfuse project dashboard:
  [https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv](https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv)
- Runtime trace readiness endpoint:
  `/api/ai/tracing-ready`
- AI command route:
  `POST /api/ai/board-command`

## 📚 Documentation Map

- User guide: `AI-AGENT-USER-GUIDE.md`
- AI cost analysis (markdown): `AI_COST_ANALYSIS.md`
- AI development log (markdown): `AI_DEVELOPMENT_LOG.md`
- Tool schema reference: `docs/ai/TOOL_SCHEMA_REFERENCE.md`
- Command catalog: `docs/ai/COMMAND_CATALOG.md`
- Architecture overview: `docs/architecture/AI_SYSTEM_OVERVIEW.md`
- Live test + tracing runbook: `docs/runbooks/AI_LIVE_TESTING_AND_LANGFUSE.md`
- Coding standards: `CODING_STANDARDS.md`

## 🛑 Rejected / Not Priority

- 🚫 Email + password sign-in
- 🚫 GitHub auth
