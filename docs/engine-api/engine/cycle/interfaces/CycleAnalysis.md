# Interface: CycleAnalysis

Defined in: engine/cycle.ts:94

## Properties

### complete

> **complete**: `boolean`

Defined in: engine/cycle.ts:100

True once every process station has a breakdown — the line-level numbers
 below are only trustworthy at that point.

***

### decomposedCount

> **decomposedCount**: `number`

Defined in: engine/cycle.ts:96

***

### lineNonValueAddSec

> **lineNonValueAddSec**: `number`

Defined in: engine/cycle.ts:102

***

### lineTotalSec

> **lineTotalSec**: `number`

Defined in: engine/cycle.ts:103

***

### lineValueAddPct

> **lineValueAddPct**: `number` \| `null`

Defined in: engine/cycle.ts:105

null until at least one station is decomposed.

***

### lineValueAddSec

> **lineValueAddSec**: `number`

Defined in: engine/cycle.ts:101

***

### stations

> **stations**: [`StationCycle`](StationCycle.md)[]

Defined in: engine/cycle.ts:95

***

### totalCount

> **totalCount**: `number`

Defined in: engine/cycle.ts:97

***

### waste

> **waste**: [`WasteEntry`](WasteEntry.md)[]

Defined in: engine/cycle.ts:107

Non-value-add classes ranked by seconds — the improvement backlog.
