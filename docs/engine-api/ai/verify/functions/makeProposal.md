# Function: makeProposal()

> **makeProposal**(`current`, `currentModel`, `draft`): [`Proposal`](../../types/interfaces/Proposal.md) \| `null`

Defined in: ai/verify.ts:47

Score a candidate against the current rating and wrap it as a Proposal.
Returns null when the candidate is invalid (introduces *new* blocking flow
errors) — we never surface a broken layout.

## Parameters

### current

[`Rating`](../../../engine/rating/interfaces/Rating.md)

### currentModel

[`Model`](../../../model/types/interfaces/Model.md)

### draft

[`ProposalDraft`](../interfaces/ProposalDraft.md)

## Returns

[`Proposal`](../../types/interfaces/Proposal.md) \| `null`
