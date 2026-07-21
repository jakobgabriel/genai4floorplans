# Interface: PlacementProposal

Defined in: engine/proposal.ts:41

## Properties

### baseSignature

> **baseSignature**: `string`

Defined in: engine/proposal.ts:55

Signature of the model this was computed against. When the live model no
longer matches, the proposal is stale — §4 says mark it, never silently
drop it.

***

### flowCostDeltaPct

> **flowCostDeltaPct**: `number`

Defined in: engine/proposal.ts:49

Flow-cost change if every item is accepted, as a percentage. Negative = better.

***

### id

> **id**: `string`

Defined in: engine/proposal.ts:42

***

### items

> **items**: [`ProposalItem`](ProposalItem.md)[]

Defined in: engine/proposal.ts:47

***

### rationale

> **rationale**: `string`

Defined in: engine/proposal.ts:46

Whole-proposal rationale and predicted effect.

***

### source

> **source**: `"optimizer"`

Defined in: engine/proposal.ts:43

***

### title

> **title**: `string`

Defined in: engine/proposal.ts:44
