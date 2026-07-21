# Interface: CandidateMetrics

Defined in: engine/generate.ts:83

## Properties

### balanceScore

> **balanceScore**: `number`

Defined in: engine/generate.ts:88

***

### capexPerPart

> **capexPerPart**: `number`

Defined in: engine/generate.ts:92

Capex amortised over the program: capex ÷ (annualVolume × programYears).

***

### capexTotal

> **capexTotal**: `number`

Defined in: engine/generate.ts:95

***

### composite

> **composite**: `number`

Defined in: engine/generate.ts:84

***

### conceptFit

> **conceptFit**: `number`

Defined in: engine/generate.ts:106

0–100 suitability of the concept for this annual volume.

***

### costPerPart

> **costPerPart**: `number`

Defined in: engine/generate.ts:90

Operating cost only — labour + energy + transport. Excludes capex.

***

### letter

> **letter**: [`Letter`](../../rating/type-aliases/Letter.md)

Defined in: engine/generate.ts:85

***

### lineOut

> **lineOut**: `number`

Defined in: engine/generate.ts:86

***

### loadedCostPerPart

> **loadedCostPerPart**: `number`

Defined in: engine/generate.ts:94

costPerPart + capexPerPart. The number a business case turns on.

***

### meetsDemand

> **meetsDemand**: `boolean`

Defined in: engine/generate.ts:104

Line output clears the per-shift demand.

***

### operators

> **operators**: `number`

Defined in: engine/generate.ts:100

***

### opexPerShift

> **opexPerShift**: `number`

Defined in: engine/generate.ts:99

***

### overCapacityPct

> **overCapacityPct**: `number`

Defined in: engine/generate.ts:98

How far line output exceeds demand, %. Lane rounding makes this unavoidable,
 but buying 50% too much line should never be invisible.

***

### parallelUnits

> **parallelUnits**: `number`

Defined in: engine/generate.ts:102

***

### stations

> **stations**: `number`

Defined in: engine/generate.ts:101

***

### takt

> **takt**: `number`

Defined in: engine/generate.ts:87

***

### valueAddPct

> **valueAddPct**: `number`

Defined in: engine/generate.ts:107
