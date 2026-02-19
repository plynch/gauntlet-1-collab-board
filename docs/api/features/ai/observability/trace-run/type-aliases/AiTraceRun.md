[**collab-board**](../../../../../README.md)

***

[collab-board](../../../../../README.md) / [features/ai/observability/trace-run](../README.md) / AiTraceRun

# Type Alias: AiTraceRun

> **AiTraceRun** = `object`

Defined in: [src/features/ai/observability/trace-run.ts:21](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L21)

## Properties

### traceId

> **traceId**: `string`

Defined in: [src/features/ai/observability/trace-run.ts:22](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L22)

***

### startSpan()

> **startSpan**: (`name`, `input?`) => `SpanHandle`

Defined in: [src/features/ai/observability/trace-run.ts:23](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L23)

#### Parameters

##### name

`string`

##### input?

`JsonRecord`

#### Returns

`SpanHandle`

***

### updateMetadata()

> **updateMetadata**: (`metadata`) => `void`

Defined in: [src/features/ai/observability/trace-run.ts:24](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L24)

#### Parameters

##### metadata

`JsonRecord`

#### Returns

`void`

***

### finishSuccess()

> **finishSuccess**: (`output?`) => `void`

Defined in: [src/features/ai/observability/trace-run.ts:25](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L25)

#### Parameters

##### output?

`JsonRecord`

#### Returns

`void`

***

### finishError()

> **finishError**: (`errorMessage`, `details?`) => `void`

Defined in: [src/features/ai/observability/trace-run.ts:26](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/observability/trace-run.ts#L26)

#### Parameters

##### errorMessage

`string`

##### details?

`JsonRecord`

#### Returns

`void`
