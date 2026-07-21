# Function: conceptCrossover()

> **conceptCrossover**(`brief`, `volumes`, `by?`): [`CrossoverPoint`](../interfaces/CrossoverPoint.md)[]

Defined in: engine/generate.ts:420

Sweep a volume range and report the best concept at each point — the "concept
A wins below 120k/yr, B above" chart that RFQ decisions actually turn on.

## Parameters

### brief

[`GenerateBrief`](../interfaces/GenerateBrief.md)

### volumes

`number`[]

### by?

[`RankBy`](../type-aliases/RankBy.md) = `"loadedCostPerPart"`

## Returns

[`CrossoverPoint`](../interfaces/CrossoverPoint.md)[]
