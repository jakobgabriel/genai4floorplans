# Function: generateCandidates()

> **generateCandidates**(`brief`): [`Candidate`](../interfaces/Candidate.md)[]

Defined in: engine/generate.ts:323

Sweep concept × form and return every candidate, engine-scored.

Every number on a candidate comes from the normal engine (buildRating,
costAnalysis) — the generator only assembles models, exactly as the AI layer
only emits models and lets verify.ts score them.

## Parameters

### brief

[`GenerateBrief`](../interfaces/GenerateBrief.md)

## Returns

[`Candidate`](../interfaces/Candidate.md)[]
