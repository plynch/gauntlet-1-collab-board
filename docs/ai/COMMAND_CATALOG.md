# AI Command Catalog

This catalog maps user phrasing to planner intent families and tool operations.

Primary planner mode for live quality:

- `AI_PLANNER_MODE=openai-strict`
- `OPENAI_RUNTIME=agents-sdk`

Fallback compatibility mode:

- `AI_PLANNER_MODE=openai-with-fallback`
- `AI_PLANNER_MODE=deterministic-only`

## Creation Commands

| User Phrase Pattern | Intent Family | Typical Tool Operations |
| --- | --- | --- |
| `add a yellow sticky note that says ...` | `create-sticky` | `createStickyNote` |
| `add a sticky at x 520 y 280 ...` | `create-sticky` | `createStickyNote` |
| `create 25 red stickies` | `create-sticky-batch` | `createStickyBatch` |
| `create a 2x3 grid of sticky notes ...` | `create-sticky-grid` | `createStickyBatch` |
| `create a blue rectangle at ...` | `create-rect` | `createShape(type="rect")` |
| `create an orange circle` | `create-circle` | `createShape(type="circle")` |
| `create a line ...` | `create-line` | `createShape(type="line")` |
| `add a frame called Sprint Planning` | `create-frame` | `createFrame` |
| `create a SWOT analysis template` | `swot-template` | `createGridContainer` + `createStickyNote` |
| `build a user journey map with 5 stages` | `journey-map-template` | `createFrame` + `createStickyNote` |
| `set up a retrospective board ...` | `retrospective-template` | `createGridContainer` + `createStickyNote` |

## Manipulation Commands

| User Phrase Pattern | Intent Family | Typical Tool Operations |
| --- | --- | --- |
| `move selected objects right by 120` | `move-selected` | `moveObjects(delta)` |
| `move selected objects to 420, 260` | `move-selected` | `moveObjects(toPoint)` |
| `move all red sticky notes to the right side` | `move-all` | `moveObjects(toViewportSide)` |
| `resize selected to 260 by 180` | `resize-selected` | `resizeObject` |
| `resize the frame to fit contents` | `fit-frame-to-contents` | `fitFrameToContents` |
| `change selected color to green` | `change-color` | `changeColor` |
| `update selected sticky text to ...` | `update-text` | `updateText` |
| `delete selected` | `delete-selected` | `deleteObjects` |
| `clear the board` / `delete everything` | `clear-board` | `deleteObjects` |

## Layout Commands

| User Phrase Pattern | Intent Family | Typical Tool Operations |
| --- | --- | --- |
| `arrange selected in a grid` | `arrange-grid` | `arrangeObjectsInGrid` |
| `arrange selected in 4 columns gap 24` | `arrange-grid` | `arrangeObjectsInGrid` |
| `align selected left` | `align-selected` | `alignObjects` |
| `distribute selected horizontally` | `distribute-selected` | `distributeObjects` |

## Insight Commands

| User Phrase Pattern | Intent Family | Typical Tool Operations |
| --- | --- | --- |
| `summarize selected notes` | `summarize-selected` | read + summary response (no board mutation) |
| `create action items from selected notes` | `action-items-selected` | `createStickyNote` batch operations |

## Planner mapping notes

- Explicit coordinates in user text should carry through into tool arguments (`x`, `y`, or `originX`/`originY`).
- High-cardinality commands should prefer `createStickyBatch` and `moveObjects` to minimize per-call overhead.
- Selection-aware commands should use `selectedObjectIds` when available.
- For viewport-side movement, include viewport bounds when provided by the client payload.
