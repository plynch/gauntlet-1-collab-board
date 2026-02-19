[**collab-board**](../../../../../README.md)

***

[collab-board](../../../../../README.md) / [features/boards/lib/realtime-write-metrics](../README.md) / RealtimeWriteMetricsCollector

# Type Alias: RealtimeWriteMetricsCollector

> **RealtimeWriteMetricsCollector** = `object`

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:21](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L21)

## Properties

### markAttempted()

> **markAttempted**: (`channel`, `count?`) => `void`

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:22](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L22)

#### Parameters

##### channel

[`RealtimeWriteChannel`](RealtimeWriteChannel.md)

##### count?

`number`

#### Returns

`void`

***

### markSkipped()

> **markSkipped**: (`channel`, `count?`) => `void`

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:23](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L23)

#### Parameters

##### channel

[`RealtimeWriteChannel`](RealtimeWriteChannel.md)

##### count?

`number`

#### Returns

`void`

***

### markCommitted()

> **markCommitted**: (`channel`, `count?`) => `void`

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:24](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L24)

#### Parameters

##### channel

[`RealtimeWriteChannel`](RealtimeWriteChannel.md)

##### count?

`number`

#### Returns

`void`

***

### snapshot()

> **snapshot**: () => [`RealtimeWriteMetricsSnapshot`](RealtimeWriteMetricsSnapshot.md)

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:25](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L25)

#### Returns

[`RealtimeWriteMetricsSnapshot`](RealtimeWriteMetricsSnapshot.md)

***

### reset()

> **reset**: () => `void`

Defined in: [src/features/boards/lib/realtime-write-metrics.ts:26](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/boards/lib/realtime-write-metrics.ts#L26)

#### Returns

`void`
