[**collab-board**](../../../../README.md)

***

[collab-board](../../../../README.md) / [features/ai/guardrail-store](../README.md) / GuardrailStore

# Type Alias: GuardrailStore

> **GuardrailStore** = `object`

Defined in: [src/features/ai/guardrail-store.ts:24](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/guardrail-store.ts#L24)

## Methods

### checkUserRateLimit()

> **checkUserRateLimit**(`options`): `Promise`\<[`GuardrailResult`](GuardrailResult.md)\>

Defined in: [src/features/ai/guardrail-store.ts:25](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/guardrail-store.ts#L25)

#### Parameters

##### options

[`GuardrailRateLimitOptions`](GuardrailRateLimitOptions.md)

#### Returns

`Promise`\<[`GuardrailResult`](GuardrailResult.md)\>

***

### acquireBoardCommandLock()

> **acquireBoardCommandLock**(`options`): `Promise`\<[`GuardrailResult`](GuardrailResult.md)\>

Defined in: [src/features/ai/guardrail-store.ts:28](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/guardrail-store.ts#L28)

#### Parameters

##### options

[`GuardrailLockOptions`](GuardrailLockOptions.md)

#### Returns

`Promise`\<[`GuardrailResult`](GuardrailResult.md)\>

***

### releaseBoardCommandLock()

> **releaseBoardCommandLock**(`boardId`): `Promise`\<`void`\>

Defined in: [src/features/ai/guardrail-store.ts:31](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/guardrail-store.ts#L31)

#### Parameters

##### boardId

`string`

#### Returns

`Promise`\<`void`\>
