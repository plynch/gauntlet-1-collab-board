# CollabBoard AI Agent User Guide

## What this guide covers

This guide explains:

- where to use the AI agent
- commands that work right now
- the full tool schema implemented in the backend
- example prompts for minimum requirements and beyond
- how MCP fallback and tracing work

## Where to issue commands

1. Open a board page (`/boards/<boardId>`).
2. Open the **AI Assistant** drawer at the bottom.
3. Enter a command in the chat input and send.

The UI calls `POST /api/ai/board-command`.

## Quick demo script (60-90 seconds)

Use these commands in order during a live demo:

1. `Create a SWOT analysis template`
2. `Create a blue rectangle at position 1200, 140`
3. `Add a yellow sticky note that says Customer feedback`
4. Select a few objects on canvas, then run:
   - `Move selected objects right by 180`
5. With one object selected, run:
   - `Change selected object color to green`
6. With one sticky note selected, run:
   - `Update selected sticky text to Top priority`

Demo narration tip:

- Mention that each command goes through `POST /api/ai/board-command` with guardrails, MCP planning/fallback, and trace spans.

## Current command support (today)

### Works now

- SWOT template generation via deterministic intent routing:
  - `Create a SWOT analysis template`
  - `Build a SWOT board`
  - `Create a SWOT analysis`
- Deterministic object command routing:
  - create sticky notes, frames, and shapes
  - create multiple stickies with count and color (for example `create 25 red stickies`)
  - create sticky-note grids from prompts like `create a 2x3 grid of sticky notes`
  - arrange selected objects into a grid (`arrange selected in a grid`, `arrange selected in 3 columns`)
  - align selected objects (`align selected left`, `align selected top`, `align selected center`)
  - distribute selected objects (`distribute selected objects horizontally`, `space selected evenly vertically`)
  - summarize selected notes into concise bullets (`summarize selected notes`)
  - extract action-item stickies from selected notes (`create action items from selected notes`)
  - move selected objects
  - move all objects of a type (optionally color-filtered)
  - resize selected objects
  - change color of selected objects
  - update selected object text

Result:

- 4 colored rectangle quadrants
- 4 label stickies:
  - Strengths
  - Weaknesses
  - Opportunities
  - Threats
- auto-placement to the right of existing board content

### Not yet routed from natural language

- connector creation from arbitrary language prompts
- advanced layout prompts beyond grid v1 (space-evenly, align)
- complex multi-step templates beyond SWOT (retro, journey map)
- full LLM planning layer for broader prompt understanding

## Tool schema (minimum + implemented set)

The backend tool schema includes:

- `createStickyNote(text, x, y, color)`
- `createShape(type, x, y, width, height, color)`
  - `type`: `rect | circle | line | triangle | star`
- `createFrame(title, x, y, width, height)`
- `createConnector(fromId, toId, style)`
  - `style`: `undirected | one-way-arrow | two-way-arrow`
- `arrangeObjectsInGrid(objectIds, columns, gapX?, gapY?, originX?, originY?)`
- `alignObjects(objectIds, alignment)`
  - `alignment`: `left | center | right | top | middle | bottom`
- `distributeObjects(objectIds, axis)`
  - `axis`: `horizontal | vertical`
- `moveObject(objectId, x, y)`
- `resizeObject(objectId, width, height)`
- `updateText(objectId, newText)`
- `changeColor(objectId, color)`
- `getBoardState()`

Notes:

- This satisfies the project’s minimum tool schema requirement.
- Current chat routing executes a subset directly (SWOT flow uses `getBoardState`, `createShape`, `createStickyNote`).

## Example command library

Use these as copy/paste starting points.

### Creation commands

- `Add a yellow sticky note that says User Research`
- `Create 25 red stickies`
- `Create a blue rectangle at position 100, 200`
- `Add a frame called Sprint Planning`
- `Create an undirected connector between object A and object B`

### Manipulation commands

- `Move the selected objects to 400, 300`
- `Resize the selected object to 220 by 140`
- `Change the selected sticky note color to green`
- `Update the selected sticky note text to Q2 priorities`

### Layout commands

- `Arrange selected sticky notes in a grid`
- `Arrange selected objects in 3 columns`
- `Align selected objects top`
- `Distribute selected objects horizontally`
- `Summarize selected notes`
- `Create action items from selected notes`
- `Create a 2x3 grid of sticky notes for pros and cons`
- `Space selected elements evenly`

### Complex template commands

- `Create a SWOT analysis template` (works now)
- `Set up a retrospective board with What Went Well, What Didn't, and Action Items columns`
- `Build a user journey map with 5 stages`

## MCP behavior and fallback

For all routed commands:

1. The command route calls internal MCP template endpoint.
2. MCP tool returns structured operations:
   - `template.instantiate` for SWOT
   - `command.plan` for deterministic non-SWOT commands
3. Operations are executed via server-side board tools.
4. If MCP is unavailable/times out, local deterministic planner/provider is used automatically.

So routed commands remain reliable even if MCP is degraded.

## Traceability (Langfuse)

Every AI command run can be traced (when Langfuse env vars are configured).

Spans emitted:

- `ai.request.received`
- `ai.intent.detected`
- `mcp.call`
- `tool.execute`
- `board.write.commit`
- `ai.response.sent`

Tool execution tracing is emitted via a LangChain callback bridge:

- chain run maps to `tool.execute`
- each tool call maps to `tool.execute.call`

The assistant response bubble also shows `traceId` for each successful command so you can find the exact run in Langfuse quickly.

Required env vars:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- optional `LANGFUSE_BASE_URL`

## Safety guardrails

The AI route currently enforces:

- max command length
- max operations per command (50)
- max object creations per command (50)
- per-user command rate limit window
- per-board concurrency lock
- MCP timeout and overall route timeout

## Permissions behavior

- Users must have board read access to use the AI endpoint.
- Mutating AI commands (like SWOT creation) require edit access.
- Read-only users receive a non-mutating response.

## Planned next expansion

Near-term roadmap:

1. Route natural language to the full tool set (not just SWOT).
2. Add MCP fallback path for all tool-planning commands.
3. Add broader template catalog and command coverage (retro, journey map, connector language).
4. Add LLM planner on top of deterministic paths, with deterministic fallback preserved.
