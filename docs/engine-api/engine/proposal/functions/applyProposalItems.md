# Function: applyProposalItems()

> **applyProposalItems**(`model`, `items`, `acceptedIds`): [`Station`](../../../model/types/interfaces/Station.md)[]

Defined in: engine/proposal.ts:162

Apply the accepted subset. This is the ONLY way a solver result reaches the
model. Unaccepted items are left untouched, pinned stations are never moved,
and every destination is clamped to the grid.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

### items

[`ProposalItem`](../interfaces/ProposalItem.md)[]

### acceptedIds

`string`[]

## Returns

[`Station`](../../../model/types/interfaces/Station.md)[]
