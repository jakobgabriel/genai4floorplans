# Function: makePlacementProposal()

> **makePlacementProposal**(`model`, `rating`): [`PlacementProposal`](../interfaces/PlacementProposal.md) \| `null`

Defined in: engine/proposal.ts:110

Wrap the optimizer's result as a proposal. Returns null when there is nothing
to propose, so callers can render "already optimal" instead of an empty card.

Pinned (`fixed`) stations are excluded defensively: `optimize.ts` already
refuses to move them, and if that ever regresses this is the second gate.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

### rating

[`Rating`](../../rating/interfaces/Rating.md)

## Returns

[`PlacementProposal`](../interfaces/PlacementProposal.md) \| `null`
