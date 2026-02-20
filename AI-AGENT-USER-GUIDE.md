# CollabBoard AI Agent User Guide

## What this guide covers

This guide explains:

- where to use the AI assistant
- commands that work in the current build
- how to get the best happy-path results
- key constraints and guardrails
- where to inspect traces and costs

## Where to issue commands

1. Open a board page (`/boards/<boardId>`).
2. Open the **AI Assistant** drawer at the bottom.
3. Enter a command in the chat input and send.

The UI calls `POST /api/ai/board-command`.

## Recommended runtime mode

For best live command quality, run OpenAI-first strict planning:

- `AI_PLANNER_MODE=openai-strict`
- `AI_ENABLE_OPENAI=true`
- `OPENAI_MODEL=gpt-4.1-nano`

In strict mode, the route does not silently hide OpenAI planner failures.

## Command catalog

### Creation

- `Add a yellow sticky note that says User Research`
- `Add a pink sticky note at position 520, 280 that says Follow-up`
- `Create 25 red stickies`
- `Create 10 red notes on the bottom of the board`
- `Create a 2x3 grid of sticky notes for pros and cons`
- `Create a blue rectangle at position 900, 120`
- `Create an orange circle`
- `Create a purple triangle`
- `Create a yellow star`
- `Create one line shape at x 220 y 220 with width 260 and height 24 in gray`
- `Add a frame called Sprint Planning`

### Manipulation

- `Move selected objects right by 120`
- `Move selected objects to 420, 260`
- `Move the sticky notes to the right side of the screen`
- `Resize selected to 260 by 180`
- `Resize the frame to fit contents`
- `Change selected object color to green`
- `Update selected sticky text to Q2 priorities`
- `Delete selected`
- `Clear the board`

### Layout

- `Arrange selected objects in a grid with 2 columns gap x 24 y 32`
- `Align selected objects left`
- `Distribute selected objects horizontally`

### Complex templates

- `Create a SWOT analysis template`
- `Add a strength - "our team"`
- `Add a weakness: slow onboarding`
- `Add an opportunity "enterprise expansion"`
- `Add a threat - new competitor`
- `Build a user journey map with 5 stages`
- `Set up a retrospective board with What Went Well, What Didn't, and Action Items columns`

## Best prompt patterns

- Be explicit with coordinates when placement matters: `at x 140 y 180`.
- Mention scope words (`selected`, `all red sticky notes`) when moving/changing many objects.
- For layout actions, select objects first, then issue the command.
- Keep one action per prompt for fastest and most reliable execution.

## Known constraints

- Message length max is enforced server-side.
- Max operations per command: `50`.
- Max created objects per command: `50`.
- `createStickyBatch` max count per call: `50`.
- Layout tool object ID cap per call: `50`.
- `moveObjects` object ID cap per call: `500`.

## What you should see in chat

- Clean assistant status messages only.
- No provider/model/trace metadata is shown in chat bubbles.

Trace IDs and detailed execution metadata remain available through API responses and Langfuse traces for debugging.

## Traceability (Langfuse)

Required env vars:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- optional: `LANGFUSE_BASE_URL`

Project dashboard:

- `https://us.cloud.langfuse.com/project/cmlu0vcd501siad07glqj49kv`

Expected span chain includes:

- `ai.request.received`
- `openai.budget.reserve`
- `openai.call`
- `tool.execute`
- `tool.execute.call`
- `board.write.commit`
- `ai.response.sent`

## Quick live validation flow (3-5 minutes)

1. `Create 10 red stickies`
2. `Move the red sticky notes to the right side of the screen`
3. Select several stickies, then run: `Arrange selected objects in a grid`
4. `Create a SWOT analysis template`
5. `Clear the board`

After each command, inspect the trace in Langfuse and verify the tool spans match the action.
