# Function: isProposalStale()

> **isProposalStale**(`proposal`, `model`): `boolean`

Defined in: engine/proposal.ts:178

True when the model has changed underneath an outstanding proposal. §4: mark
it stale rather than deleting it silently — the user decides what to do.

## Parameters

### proposal

[`PlacementProposal`](../interfaces/PlacementProposal.md)

### model

[`Model`](../../../model/types/interfaces/Model.md)

## Returns

`boolean`
