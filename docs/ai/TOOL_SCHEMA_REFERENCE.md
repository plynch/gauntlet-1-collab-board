# AI Tool Schema Reference

This is the canonical runtime tool schema for `POST /api/ai/board-command` planning and execution.

Source of truth:

- `src/features/ai/types.ts`
- `src/features/ai/board-tool-schema.ts`
- `src/features/ai/tools/board-tools.ts`

## Principles

- Prefer high-level tools for reliability and lower latency.
- Keep tool calls compact and deterministic.
- Respect guardrail limits before execution.

## Tool List

### `createStickyNote`

Args:

- `text: string`
- `x: number`
- `y: number`
- `color: string`

Use when:

- user asks for a single note with explicit placement/content

Example:

- `createStickyNote({ text: "User Research", x: 140, y: 180, color: "#fde68a" })`

### `createStickyBatch`

Args:

- `count: number`
- `color: string`
- `originX: number`
- `originY: number`
- `columns?: number`
- `gapX?: number`
- `gapY?: number`
- `textPrefix?: string`

Use when:

- user asks for many stickies (`create 25 red stickies`)
- user asks for note grids

Guardrail:

- max `count` per call: `50`

### `createShape`

Args:

- `type: "rect" | "circle" | "line" | "triangle" | "star"`
- `x: number`
- `y: number`
- `width: number`
- `height: number`
- `color: string`

Use when:

- user asks for geometric primitives

Notes:

- line shape is supported via `type: "line"`

### `createGridContainer`

Args:

- `x: number`
- `y: number`
- `width: number`
- `height: number`
- `rows: number`
- `cols: number`
- `gap: number`
- `cellColors?: string[]`
- `containerTitle?: string`
- `sectionTitles?: string[]`
- `sectionNotes?: string[]`

Use when:

- template-style boards (SWOT, retrospective, journey map)

### `createFrame`

Args:

- `title: string`
- `x: number`
- `y: number`
- `width: number`
- `height: number`

Use when:

- user asks for a labeled grouping frame

### `createConnector`

Args:

- `fromId: string`
- `toId: string`
- `style: "undirected" | "one-way-arrow" | "two-way-arrow"`

Use when:

- linking two known objects by ID

### `arrangeObjectsInGrid`

Args:

- `objectIds: string[]`
- `columns: number`
- `gapX?: number`
- `gapY?: number`
- `originX?: number`
- `originY?: number`

Use when:

- selected objects need row/column layout

Guardrail:

- max `objectIds.length`: `50`

### `alignObjects`

Args:

- `objectIds: string[]`
- `alignment: "left" | "center" | "right" | "top" | "middle" | "bottom"`

Use when:

- selected objects should align to one shared edge or center line

Guardrail:

- max `objectIds.length`: `50`

### `distributeObjects`

Args:

- `objectIds: string[]`
- `axis: "horizontal" | "vertical"`

Use when:

- selected objects should be evenly spaced

Guardrail:

- max `objectIds.length`: `50`

### `moveObject`

Args:

- `objectId: string`
- `x: number`
- `y: number`

Use when:

- single-object absolute move

### `moveObjects`

Args:

- `objectIds: string[]`
- one of:
  - `delta: { dx: number; dy: number }`
  - `toPoint: { x: number; y: number }`
  - `toViewportSide: { side: "left" | "right" | "top" | "bottom"; viewportBounds?: { left: number; top: number; width: number; height: number }; padding?: number }`

Use when:

- moving selected/all matching objects in one call
- viewport-side placement commands

Guardrail:

- max `objectIds.length`: `500`

### `resizeObject`

Args:

- `objectId: string`
- `width: number`
- `height: number`

Use when:

- resizing a selected object

### `updateText`

Args:

- `objectId: string`
- `newText: string`

Use when:

- updating sticky/frame text from command input

### `changeColor`

Args:

- `objectId: string`
- `color: string`

Use when:

- changing selected object color

### `deleteObjects`

Args:

- `objectIds: string[]`

Use when:

- delete selected / clear board operations

Guardrail:

- max `objectIds.length`: `2000`

### `fitFrameToContents`

Args:

- `frameId: string`
- `padding?: number`

Use when:

- user asks to resize frame to fit overlapping contents

### `getBoardState`

Args:

- `{}`

Use when:

- planner needs object context before generating operations
