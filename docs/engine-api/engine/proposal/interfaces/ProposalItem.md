# Interface: ProposalItem

Defined in: engine/proposal.ts:27

One station move. Accept or reject independently of its siblings.

## Properties

### flowCostDeltaPct

> **flowCostDeltaPct**: `number`

Defined in: engine/proposal.ts:38

Predicted flow-cost change if THIS item alone is accepted, as a percentage
of the current flow cost. Negative is an improvement.

***

### from

> **from**: `object`

Defined in: engine/proposal.ts:30

#### x

> **x**: `number`

#### y

> **y**: `number`

***

### name

> **name**: `string`

Defined in: engine/proposal.ts:29

***

### rationale

> **rationale**: `string`

Defined in: engine/proposal.ts:33

Plain-language reason. Mandatory — §4 and Law 6 (show the mechanism).

***

### stationId

> **stationId**: `string`

Defined in: engine/proposal.ts:28

***

### to

> **to**: `object`

Defined in: engine/proposal.ts:31

#### x

> **x**: `number`

#### y

> **y**: `number`
