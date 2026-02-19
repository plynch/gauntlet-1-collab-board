[**collab-board**](../../../../README.md)

***

[collab-board](../../../../README.md) / [features/ai/types](../README.md) / BoardToolCall

# Type Alias: BoardToolCall

> **BoardToolCall** = \{ `tool`: `"createStickyNote"`; `args`: \{ `text`: `string`; `x`: `number`; `y`: `number`; `color`: `string`; \}; \} \| \{ `tool`: `"createShape"`; `args`: \{ `type`: [`BoardObjectToolKind`](BoardObjectToolKind.md); `x`: `number`; `y`: `number`; `width`: `number`; `height`: `number`; `color`: `string`; \}; \} \| \{ `tool`: `"createGridContainer"`; `args`: \{ `x`: `number`; `y`: `number`; `width`: `number`; `height`: `number`; `rows`: `number`; `cols`: `number`; `gap`: `number`; `cellColors?`: `string`[]; `containerTitle?`: `string`; `sectionTitles?`: `string`[]; `sectionNotes?`: `string`[]; \}; \} \| \{ `tool`: `"createFrame"`; `args`: \{ `title`: `string`; `x`: `number`; `y`: `number`; `width`: `number`; `height`: `number`; \}; \} \| \{ `tool`: `"createConnector"`; `args`: \{ `fromId`: `string`; `toId`: `string`; `style`: `"undirected"` \| `"one-way-arrow"` \| `"two-way-arrow"`; \}; \} \| \{ `tool`: `"moveObject"`; `args`: \{ `objectId`: `string`; `x`: `number`; `y`: `number`; \}; \} \| \{ `tool`: `"resizeObject"`; `args`: \{ `objectId`: `string`; `width`: `number`; `height`: `number`; \}; \} \| \{ `tool`: `"updateText"`; `args`: \{ `objectId`: `string`; `newText`: `string`; \}; \} \| \{ `tool`: `"changeColor"`; `args`: \{ `objectId`: `string`; `color`: `string`; \}; \} \| \{ `tool`: `"deleteObjects"`; `args`: \{ `objectIds`: `string`[]; \}; \} \| \{ `tool`: `"getBoardState"`; `args?`: `Record`\<`string`, `never`\>; \}

Defined in: [src/features/ai/types.ts:64](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/types.ts#L64)
