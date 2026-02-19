[**collab-board**](../../../../README.md)

***

[collab-board](../../../../README.md) / [server/api/board-route-schemas](../README.md) / boardAccessActionSchema

# Variable: boardAccessActionSchema

> `const` **boardAccessActionSchema**: `ZodDiscriminatedUnion`\<\[`ZodObject`\<\{ `action`: `ZodLiteral`\<`"set-open-edit"`\>; `openEdit`: `ZodBoolean`; \}, `$strip`\>, `ZodObject`\<\{ `action`: `ZodLiteral`\<`"set-open-read"`\>; `openRead`: `ZodBoolean`; \}, `$strip`\>, `ZodObject`\<\{ `action`: `ZodLiteral`\<`"add-editor"`\>; `editorEmail`: `ZodString`; \}, `$strip`\>, `ZodObject`\<\{ `action`: `ZodLiteral`\<`"remove-editor"`\>; `editorUid`: `ZodString`; \}, `$strip`\>, `ZodObject`\<\{ `action`: `ZodLiteral`\<`"add-reader"`\>; `readerEmail`: `ZodString`; \}, `$strip`\>, `ZodObject`\<\{ `action`: `ZodLiteral`\<`"remove-reader"`\>; `readerUid`: `ZodString`; \}, `$strip`\>\], `"action"`\>

Defined in: [src/server/api/board-route-schemas.ts:21](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/server/api/board-route-schemas.ts#L21)
