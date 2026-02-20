# AI Live Testing And Langfuse Runbook

## Goal

Validate happy-path command quality, trace coverage, and paid/non-paid suites.

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

## Runtime Setup

### Fallback matrix (no paid LLM)

- `AI_PLANNER_MODE=deterministic-only`
- `AI_ENABLE_OPENAI=false`

### Paid OpenAI matrix (Agents SDK)

- `AI_PLANNER_MODE=openai-strict`
- `AI_ENABLE_OPENAI=true`
- `AI_REQUIRE_OPENAI=true`
- `OPENAI_RUNTIME=agents-sdk`
- `OPENAI_MODEL=gpt-4.1-nano`
- optional:
  - `OPENAI_AGENTS_MAX_TURNS=8`
  - `OPENAI_AGENTS_TRACING=true`
  - `OPENAI_AGENTS_WORKFLOW_NAME=collabboard-command`

## Commands

### Free fallback matrix (20 calls)

```bash
npm run test:e2e:ai-agent-calls:fallback
```

### Paid OpenAI matrix (20 calls)

```bash
npm run test:e2e:ai-agent-calls:openai-matrix:nano:PAID
```

### Paid required-capabilities suite (rubric command set)

```bash
npm run test:e2e:ai-required-capabilities:openai-agents:nano:PAID
```

This suite runs the required command catalog from the project brief using
`OPENAI_RUNTIME=agents-sdk` + `AI_PLANNER_MODE=openai-strict`.

Legacy alias:

```bash
npm run test:e2e:ai-openai-smoke:nano:PAID
```

## Expected Output

Each test prints:

```text
[langfuse-trace] case=<case-id> traceId=<uuid> dashboard=https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv
```

## Manual Live Browser Pass

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

## Langfuse Verification

For each tested command:

1. Open trace by `traceId`.
2. Confirm full span chain exists.
3. Confirm `openai.call` has runtime metadata (`agents-sdk`).
4. Confirm `tool.execute.call` spans list executed tools.

## OpenAI Trace Correlation

With Agents tracing enabled:

1. OpenAI tracing should include metadata fields:
   - `langfuseTraceId`
   - `boardId`
   - `userId`
   - `plannerMode`
   - `runtimeBackend`
2. In Langfuse `openai.call`, confirm `openAiRunId` when available.

## Common Failure Signatures

- `OpenAI planner disabled`: `AI_ENABLE_OPENAI` false or mode deterministic-only.
- `OpenAI-required mode ... planned=false`: strict mode with unsupported command.
- `budget blocked`: reserve/cap guardrail exceeded.
- `MCP_INTERNAL_TOKEN is missing`: MCP call skipped (fallback path).
