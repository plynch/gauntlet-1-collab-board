[**collab-board**](../../../../../README.md)

***

[collab-board](../../../../../README.md) / [features/ai/tools/board-tools](../README.md) / BoardToolExecutor

# Class: BoardToolExecutor

Defined in: [src/features/ai/tools/board-tools.ts:301](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L301)

## Constructors

### Constructor

> **new BoardToolExecutor**(`options`): `BoardToolExecutor`

Defined in: [src/features/ai/tools/board-tools.ts:312](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L312)

Initializes this class instance.

#### Parameters

##### options

`BoardToolExecutorOptions`

#### Returns

`BoardToolExecutor`

## Properties

### boardId

> `private` `readonly` **boardId**: `string`

Defined in: [src/features/ai/tools/board-tools.ts:302](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L302)

***

### userId

> `private` `readonly` **userId**: `string`

Defined in: [src/features/ai/tools/board-tools.ts:303](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L303)

***

### db

> `private` `readonly` **db**: `Firestore`

Defined in: [src/features/ai/tools/board-tools.ts:304](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L304)

***

### objectsById

> `private` `readonly` **objectsById**: `Map`\<`string`, [`BoardObjectSnapshot`](../../../types/type-aliases/BoardObjectSnapshot.md)\>

Defined in: [src/features/ai/tools/board-tools.ts:305](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L305)

***

### hasLoadedObjects

> `private` **hasLoadedObjects**: `boolean` = `false`

Defined in: [src/features/ai/tools/board-tools.ts:306](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L306)

***

### nextZIndex

> `private` **nextZIndex**: `number` = `1`

Defined in: [src/features/ai/tools/board-tools.ts:307](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L307)

## Accessors

### objectsCollection

#### Get Signature

> **get** `private` **objectsCollection**(): `CollectionReference`\<`DocumentData`, `DocumentData`\>

Defined in: [src/features/ai/tools/board-tools.ts:318](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L318)

##### Returns

`CollectionReference`\<`DocumentData`, `DocumentData`\>

## Methods

### ensureLoadedObjects()

> `private` **ensureLoadedObjects**(): `Promise`\<`void`\>

Defined in: [src/features/ai/tools/board-tools.ts:325](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L325)

Handles ensure loaded objects.

#### Returns

`Promise`\<`void`\>

***

### getBoardState()

> **getBoardState**(): `Promise`\<[`BoardObjectSnapshot`](../../../types/type-aliases/BoardObjectSnapshot.md)[]\>

Defined in: [src/features/ai/tools/board-tools.ts:355](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L355)

Gets board state.

#### Returns

`Promise`\<[`BoardObjectSnapshot`](../../../types/type-aliases/BoardObjectSnapshot.md)[]\>

***

### createObject()

> `private` **createObject**(`options`): `Promise`\<[`BoardObjectSnapshot`](../../../types/type-aliases/BoardObjectSnapshot.md)\>

Defined in: [src/features/ai/tools/board-tools.ts:365](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L365)

Creates object.

#### Parameters

##### options

###### type

[`BoardObjectToolKind`](../../../types/type-aliases/BoardObjectToolKind.md)

###### x

`number`

###### y

`number`

###### width

`number`

###### height

`number`

###### color

`string`

###### text?

`string`

###### rotationDeg?

`number`

###### gridRows?

`number`

###### gridCols?

`number`

###### gridGap?

`number`

###### gridCellColors?

`string`[]

###### containerTitle?

`string`

###### gridSectionTitles?

`string`[]

###### gridSectionNotes?

`string`[]

#### Returns

`Promise`\<[`BoardObjectSnapshot`](../../../types/type-aliases/BoardObjectSnapshot.md)\>

***

### updateObject()

> `private` **updateObject**(`objectId`, `payload`): `Promise`\<`void`\>

Defined in: [src/features/ai/tools/board-tools.ts:456](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L456)

Handles update object.

#### Parameters

##### objectId

`string`

##### payload

`Partial`\<`Pick`\<`BoardObjectDoc`, `"x"` \| `"y"` \| `"width"` \| `"height"` \| `"color"` \| `"text"`\>\>

#### Returns

`Promise`\<`void`\>

***

### createStickyNote()

> **createStickyNote**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:482](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L482)

Creates sticky note.

#### Parameters

##### args

###### text

`string`

###### x

`number`

###### y

`number`

###### color

`string`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### createShape()

> **createShape**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:504](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L504)

Creates shape.

#### Parameters

##### args

###### type

[`BoardObjectToolKind`](../../../types/type-aliases/BoardObjectToolKind.md)

###### x

`number`

###### y

`number`

###### width

`number`

###### height

`number`

###### color

`string`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### createGridContainer()

> **createGridContainer**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:535](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L535)

Creates grid container.

#### Parameters

##### args

###### x

`number`

###### y

`number`

###### width

`number`

###### height

`number`

###### rows

`number`

###### cols

`number`

###### gap

`number`

###### cellColors?

`string`[]

###### containerTitle?

`string`

###### sectionTitles?

`string`[]

###### sectionNotes?

`string`[]

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### createFrame()

> **createFrame**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:593](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L593)

Creates frame.

#### Parameters

##### args

###### title

`string`

###### x

`number`

###### y

`number`

###### width

`number`

###### height

`number`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### createConnector()

> **createConnector**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:616](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L616)

Creates connector.

#### Parameters

##### args

###### fromId

`string`

###### toId

`string`

###### style

`"undirected"` \| `"one-way-arrow"` \| `"two-way-arrow"`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### moveObject()

> **moveObject**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:707](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L707)

Handles move object.

#### Parameters

##### args

###### objectId

`string`

###### x

`number`

###### y

`number`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### resizeObject()

> **resizeObject**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:723](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L723)

Handles resize object.

#### Parameters

##### args

###### objectId

`string`

###### width

`number`

###### height

`number`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### updateText()

> **updateText**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:739](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L739)

Handles update text.

#### Parameters

##### args

###### objectId

`string`

###### newText

`string`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### changeColor()

> **changeColor**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:753](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L753)

Handles change color.

#### Parameters

##### args

###### objectId

`string`

###### color

`string`

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### deleteObjects()

> **deleteObjects**(`args`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:767](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L767)

Handles delete objects.

#### Parameters

##### args

###### objectIds

`string`[]

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### executeToolCall()

> **executeToolCall**(`toolCall`): `Promise`\<`ExecuteToolResult`\>

Defined in: [src/features/ai/tools/board-tools.ts:809](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L809)

Handles execute tool call.

#### Parameters

##### toolCall

[`BoardToolCall`](../../../types/type-aliases/BoardToolCall.md)

#### Returns

`Promise`\<`ExecuteToolResult`\>

***

### executeTemplatePlan()

> **executeTemplatePlan**(`plan`): `Promise`\<\{ `results`: `ExecuteToolResult`[]; `createdObjectIds`: `string`[]; \}\>

Defined in: [src/features/ai/tools/board-tools.ts:846](https://github.com/plynch/gauntlet-1-collab-board/blob/328a21d8fbaa5406f5e5d11b6226e618299cff71/src/features/ai/tools/board-tools.ts#L846)

Handles execute template plan.

#### Parameters

##### plan

[`TemplatePlan`](../../../types/type-aliases/TemplatePlan.md)

#### Returns

`Promise`\<\{ `results`: `ExecuteToolResult`[]; `createdObjectIds`: `string`[]; \}\>
