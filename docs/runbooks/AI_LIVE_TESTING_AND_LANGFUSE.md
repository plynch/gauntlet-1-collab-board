# AI Live Testing And Langfuse Runbook

## Goal

Validate happy-path command quality, trace coverage, and paid/non-paid test suites.

Langfuse project:

- `https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv`

## Prerequisites

- Node + npm
- Java 21+
- Firebase emulator available
- `.env.local` configured with:
  - `LANGFUSE_PUBLIC_KEY`
  - `LANGFUSE_SECRET_KEY`
  - optional `LANGFUSE_BASE_URL`
  - `OPENAI_API_KEY` (for paid OpenAI suite)

## Planner mode setup

### Fallback matrix (no paid LLM)

- `AI_PLANNER_MODE=deterministic-only`
- `AI_ENABLE_OPENAI=false`

### Paid OpenAI matrix

- `AI_PLANNER_MODE=openai-strict`
- `AI_ENABLE_OPENAI=true`
- `AI_REQUIRE_OPENAI=true`
- `OPENAI_MODEL=gpt-4.1-nano`

## Commands

### Free fallback matrix (20 calls)

```bash
npm run test:e2e:ai-agent-calls:fallback
```

### Paid OpenAI matrix (20 calls)

```bash
npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID
```

Legacy alias:

```bash
npm run test:e2e:ai-openai-smoke:nano:PAID
```

## Expected output

Each test prints:

```text
[langfuse-trace] case=<case-id> traceId=<uuid> dashboard=https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv
```

## Manual live browser pass

Run on deployed app after pushing:

1. `Create 10 red stickies`
2. `Move the red sticky notes to the right side of the screen`
3. Select several notes: `Arrange selected objects in a grid`
4. `Create a SWOT analysis template`
5. `Clear the board`

Expected:

- no timeout for normal board size commands
- visible board mutations match prompt intent
- clean chat messages without provider/model/trace details

## Langfuse verification

For each tested command:

1. Open trace by `traceId`.
2. Confirm span chain exists end-to-end.
3. Confirm tool spans (`tool.execute.call`) contain tool metadata.
4. Confirm OpenAI spans show model/tokens/estimated cost for paid runs.

## Common failure signatures

- `OpenAI planner disabled`: `AI_ENABLE_OPENAI` false or mode set to deterministic-only.
- `OpenAI-required mode ... planned=false`: prompt unsupported in strict mode.
- `budget blocked`: reserve/cap guardrail exceeded.
- `MCP_INTERNAL_TOKEN is missing`: MCP call skipped (deterministic fallback path).
