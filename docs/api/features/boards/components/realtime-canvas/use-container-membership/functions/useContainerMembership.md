[**collab-board**](../../../../../../README.md)

***

[collab-board](../../../../../../README.md) / [features/boards/components/realtime-canvas/use-container-membership](../README.md) / useContainerMembership

# Function: useContainerMembership()

> **useContainerMembership**(`__namedParameters`): `object`

Defined in: src/features/boards/components/realtime-canvas/use-container-membership.ts:142

Handles use container membership.

## Parameters

### \_\_namedParameters

`UseContainerMembershipArgs`

## Returns

`object`

### getContainerSectionsInfoById()

> **getContainerSectionsInfoById**: (`geometryOverrides`) => `Map`\<`string`, `ContainerSectionsInfo`\>

#### Parameters

##### geometryOverrides?

`Record`\<`string`, [`MembershipObjectGeometry`](../type-aliases/MembershipObjectGeometry.md)\> = `{}`

#### Returns

`Map`\<`string`, `ContainerSectionsInfo`\>

### resolveContainerMembershipForGeometry()

> **resolveContainerMembershipForGeometry**: (`objectId`, `geometry`, `containerSectionsById`) => [`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)

#### Parameters

##### objectId

`string`

##### geometry

[`MembershipObjectGeometry`](../type-aliases/MembershipObjectGeometry.md)

##### containerSectionsById

`Map`\<`string`, `ContainerSectionsInfo`\>

#### Returns

[`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)

### getSectionAnchoredObjectUpdatesForContainer()

> **getSectionAnchoredObjectUpdatesForContainer**: (`containerId`, `containerGeometry`, `rows`, `cols`, `gap`) => `object`

#### Parameters

##### containerId

`string`

##### containerGeometry

[`MembershipObjectGeometry`](../type-aliases/MembershipObjectGeometry.md)

##### rows

`number`

##### cols

`number`

##### gap

`number`

#### Returns

`object`

##### positionByObjectId

> **positionByObjectId**: `Record`\<`string`, [`MembershipBoardPoint`](../type-aliases/MembershipBoardPoint.md)\>

##### membershipByObjectId

> **membershipByObjectId**: `Record`\<`string`, [`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)\>

### buildContainerMembershipPatchesForPositions()

> **buildContainerMembershipPatchesForPositions**: (`nextPositionsById`, `seedPatches`) => `Record`\<`string`, [`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)\>

#### Parameters

##### nextPositionsById

`Record`\<`string`, [`MembershipBoardPoint`](../type-aliases/MembershipBoardPoint.md)\>

##### seedPatches?

`Record`\<`string`, [`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)\> = `{}`

#### Returns

`Record`\<`string`, [`ContainerMembershipPatch`](../type-aliases/ContainerMembershipPatch.md)\>
