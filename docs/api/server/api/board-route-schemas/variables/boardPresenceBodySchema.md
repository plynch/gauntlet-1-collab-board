[**collab-board**](../../../../README.md)

***

[collab-board](../../../../README.md) / [server/api/board-route-schemas](../README.md) / boardPresenceBodySchema

# Variable: boardPresenceBodySchema

> `const` **boardPresenceBodySchema**: `ZodPipe`\<`ZodObject`\<\{ `active`: `ZodBoolean`; `cursorX`: `ZodOptional`\<`ZodNullable`\<`ZodNumber`\>\>; `cursorY`: `ZodOptional`\<`ZodNullable`\<`ZodNumber`\>\>; \}, `$strip`\>, `ZodTransform`\<\{ `active`: `boolean`; `cursorX`: `number` \| `null`; `cursorY`: `number` \| `null`; \}, \{ `active`: `boolean`; `cursorX?`: `number` \| `null`; `cursorY?`: `number` \| `null`; \}\>\>

Defined in: [src/server/api/board-route-schemas.ts:7](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/server/api/board-route-schemas.ts#L7)
