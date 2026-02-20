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
4. Planner runs according to `AI_PLANNER_MODE`.
5. Plan is validated against operation/object limits.
6. `BoardToolExecutor` applies operations to Firestore.
7. Response returns assistant message plus execution summary.

## Planner Modes

### `openai-strict`

- OpenAI planner is required.
- If OpenAI does not return a valid plan, request fails with actionable error.
- Best mode for live happy-path quality validation.

### `openai-with-fallback`

- OpenAI attempted first.
- deterministic/MCP fallback used when OpenAI cannot plan.
- useful for resilience in local/dev environments.

### `deterministic-only`

- OpenAI planner disabled.
- deterministic planner path only.
- used for free/no-token fallback matrix tests.

## Planning Layers

### OpenAI planner

- file: `src/features/ai/openai/openai-command-planner.ts`
- outputs strict JSON: `intent`, `planned`, `assistantMessage`, `operations`
- normalized through alias-handling before schema validation

### Deterministic planner

- file: `src/features/ai/commands/deterministic-command-planner.ts`
- covers fixed command families and deterministic template operations

### MCP planner integration

- route can call internal MCP endpoint (`/api/mcp/templates`) for template planning

## Execution Layer

- file: `src/features/ai/tools/board-tools.ts`
- server-side tool executor performs batched Firestore writes where possible
- supports high-level bulk tools (`createStickyBatch`, `moveObjects`, `fitFrameToContents`)

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

## Observability

Langfuse spans include:

- `ai.request.received`
- `openai.budget.reserve`
- `openai.call`
- `mcp.call`
- `tool.execute`
- `tool.execute.call`
- `board.write.commit`
- `ai.response.sent`

Trace metadata includes:

- planner mode/path
- per-tool operation counts
- coordinate hint extraction
- partial argument previews for tool calls

## UX policy

- Chat bubbles stay user-focused (no provider/model/trace metadata rendered in the drawer).
- Traceability details remain available in API response payloads and Langfuse.
