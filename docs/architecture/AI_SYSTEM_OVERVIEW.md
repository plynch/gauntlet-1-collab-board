# AI System Overview

## Objective

Provide natural-language board operations with:

- predictable execution
- strong traceability
- explicit guardrails
- bounded spend

## Request Flow

1. UI submits `POST /api/ai/board-command`.
2. Route authenticates user and validates board access.
3. Route acquires per-user/per-board guardrails.
4. OpenAI runtime backend is selected by `OPENAI_RUNTIME`.
5. Planner mode is applied (`AI_PLANNER_MODE`).
6. Guardrails are enforced before write operations.
7. `BoardToolExecutor` applies operations to Firestore.
8. Response returns assistant message plus execution summary.

## Runtime Selection

- `OPENAI_RUNTIME=agents-sdk` (default): OpenAI agent calls board tools directly.
- `OPENAI_RUNTIME=chat-completions`: legacy JSON planner backend.
- `AI_PLANNER_MODE` semantics are unchanged for both runtimes.

## Planner Modes

### `openai-strict`

- OpenAI planning/runtime success is required.
- If OpenAI does not produce a valid planned outcome, request fails with actionable error.

### `openai-with-fallback`

- OpenAI attempted first.
- deterministic/MCP fallback used when OpenAI is not-planned, budget-blocked, or errors.

### `deterministic-only`

- OpenAI disabled.
- deterministic planner path only.

## Planning Layers

### OpenAI Agents SDK runtime (primary)

- files:
  - `src/features/ai/openai/agents/openai-agents-runner.ts`
  - `src/features/ai/openai/agents/board-agent-tools.ts`
- uses `@openai/agents` with direct tool-calling.
- tool wrappers map 1:1 to canonical board tools.
- mutating tool calls are guardrail-validated pre-write.
- final output schema: `intent`, `planned`, `assistantMessage`.

### Legacy OpenAI planner backend (rollback path)

- file: `src/features/ai/openai/openai-command-planner.ts`
- selected when `OPENAI_RUNTIME=chat-completions`
- outputs strict JSON: `intent`, `planned`, `assistantMessage`, `operations`
- retained for rollback and regression isolation.

### Deterministic planner

- file: `src/features/ai/commands/deterministic-command-planner.ts`
- fixed command-family parsing for no-token and fallback execution.

### MCP planner integration

- route can call internal MCP endpoint (`/api/mcp/templates`) for template planning.

## Execution Layer

- file: `src/features/ai/tools/board-tools.ts`
- server-side tool executor performs batched Firestore writes where possible.
- supports high-level bulk tools (`createStickyBatch`, `moveObjects`, `fitFrameToContents`).
- shared by deterministic planner, MCP planner responses, and Agents SDK tool wrappers.

## Guardrails

- file: `src/features/ai/guardrails.ts`
- max operations per command
- max created objects per command
- per-tool limits (layout object counts, sticky batch count, move batch size)
- route timeout, rate-limit window, board lock

## Cost Controls

- file: `src/features/ai/openai/openai-cost-controls.ts`
- reservation-per-call (`OPENAI_RESERVE_USD_PER_CALL`, default `0.003`)
- app-level hard cap (`$10`) via spend store
- guardrail store backend: memory or Firestore
- in Agents runtime, usage finalization uses SDK run usage when available; reserve value remains fallback

## Observability

Langfuse spans:

- `ai.request.received`
- `openai.budget.reserve`
- `openai.call`
- `mcp.call`
- `tool.execute`
- `tool.execute.call`
- `board.write.commit`
- `ai.response.sent`

OpenAI tracing:

- enabled by `OPENAI_AGENTS_TRACING` (default `true`)
- optional tracing API key override: `OPENAI_AGENTS_TRACING_API_KEY`
- workflow name from `OPENAI_AGENTS_WORKFLOW_NAME`
- trace metadata includes `langfuseTraceId`, `boardId`, `userId`, planner mode, runtime backend
- Langfuse `openai.call` span includes runtime and OpenAI response ID when available

## Why Hybrid Runtime

- Meets “agents through their API” requirement using official OpenAI Agents SDK.
- Preserves existing UI and `/api/ai/board-command` response contract.
- Keeps deterministic and legacy planner paths for resilience and free regression coverage.
- Minimizes deadline risk versus a full OpenAI-hosted backend migration.

## UX Policy

- Chat bubbles remain user-focused (no provider/model/trace metadata).
- Traceability details remain available in API payloads and Langfuse.
