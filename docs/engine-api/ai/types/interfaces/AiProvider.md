# Interface: AiProvider

Defined in: ai/types.ts:88

## Properties

### name

> **name**: `string`

Defined in: ai/types.ts:89

## Methods

### design()

> **design**(`brief`): `Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

Defined in: ai/types.ts:99

Generate a full starter model from a free-text brief.

#### Parameters

##### brief

`string`

#### Returns

`Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

***

### edit()

> **edit**(`ctx`, `instruction`): `Promise`\<[`EditResult`](EditResult.md)\>

Defined in: ai/types.ts:95

Translate a natural-language instruction into validated model actions.

#### Parameters

##### ctx

[`ProposalContext`](ProposalContext.md)

##### instruction

`string`

#### Returns

`Promise`\<[`EditResult`](EditResult.md)\>

***

### ingest()

> **ingest**(`text`): `Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

Defined in: ai/types.ts:97

Build an initial model from a pasted routing sheet / CSV / description.

#### Parameters

##### text

`string`

#### Returns

`Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

***

### ingestImage()

> **ingestImage**(`image`): `Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

Defined in: ai/types.ts:101

Extract a model from a photo / image (vision; LLM-only).

#### Parameters

##### image

[`AiImage`](AiImage.md)

#### Returns

`Promise`\<[`Model`](../../../model/types/interfaces/Model.md)\>

***

### narrate()

> **narrate**(`ctx`): `Promise`\<`string`\>

Defined in: ai/types.ts:93

Plain-language narration of the current rating & trade-offs.

#### Parameters

##### ctx

[`ProposalContext`](ProposalContext.md)

#### Returns

`Promise`\<`string`\>

***

### optimizeGoal()

> **optimizeGoal**(`ctx`, `goal`): `Promise`\<[`GoalResult`](GoalResult.md)\>

Defined in: ai/types.ts:103

Search a verified sequence of edits toward a goal under constraints.

#### Parameters

##### ctx

[`ProposalContext`](ProposalContext.md)

##### goal

[`GoalSpec`](GoalSpec.md)

#### Returns

`Promise`\<[`GoalResult`](GoalResult.md)\>

***

### propose()

> **propose**(`ctx`): `Promise`\<[`Proposal`](Proposal.md)[]\>

Defined in: ai/types.ts:91

Candidate layouts with rationale; each scored by the engine.

#### Parameters

##### ctx

[`ProposalContext`](ProposalContext.md)

#### Returns

`Promise`\<[`Proposal`](Proposal.md)[]\>
