[**collab-board**](../../../../README.md)

***

[collab-board](../../../../README.md) / [features/ai/guardrails](../README.md) / checkUserRateLimit

# Function: checkUserRateLimit()

> **checkUserRateLimit**(`userId`, `nowMs?`): `Promise`\<\{ `ok`: `true`; \} \| \{ `ok`: `false`; `status`: `number`; `error`: `string`; \}\>

Defined in: [src/features/ai/guardrails.ts:111](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/guardrails.ts#L111)

Handles check user rate limit.

## Parameters

### userId

`string`

### nowMs?

`number` = `...`

## Returns

`Promise`\<\{ `ok`: `true`; \} \| \{ `ok`: `false`; `status`: `number`; `error`: `string`; \}\>
