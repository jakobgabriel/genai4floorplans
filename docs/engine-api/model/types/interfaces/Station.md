# Interface: Station

Defined in: model/types.ts:64

## Properties

### auto

> **auto**: [`AutoState`](../type-aliases/AutoState.md)

Defined in: model/types.ts:74

***

### automationCapex?

> `optional` **automationCapex?**: `number`

Defined in: model/types.ts:107

Estimated cost to automate this step (drives ROI payback). Default 0.

***

### autoOverride

> **autoOverride**: [`AutoOverride`](../type-aliases/AutoOverride.md)

Defined in: model/types.ts:75

***

### bufferCapacity?

> `optional` **bufferCapacity?**: `number`

Defined in: model/types.ts:115

WIP a FLOW FUNCTION (buffer / store) can hold, in pieces. A buffer decouples
 its neighbours by absorbing this much inventory; it is not a work step, so it
 never contributes cycle time, takt, balance or operators. Absent ⇒ 0.

***

### capacityPerShift

> **capacityPerShift**: `number`

Defined in: model/types.ts:76

***

### capex?

> `optional` **capex?**: `number`

Defined in: model/types.ts:105

One-time capital cost of the step's equipment (cost units). Default 0.

***

### cells?

> `optional` **cells?**: \[`number`, `number`\][]

Defined in: model/types.ts:86

Occupied cell offsets within the w×h bounding box. Absent ⇒ full rectangle.

***

### changeoverMin

> **changeoverMin**: `number`

Defined in: model/types.ts:79

***

### clearance?

> `optional` **clearance?**: [`Clearance`](Clearance.md)

Defined in: model/types.ts:132

Keep-clear access margins around the footprint, in grid cells per side
 (spec §12 access_clearance / §14 clearance). The space an operator or
 maintenance needs, and an aisle must not be blocked by another machine's
 body. Absent ⇒ no declared clearance. A first, grid-aligned increment
 toward a real envelope (audit C-03); true machine-relative access is a
 later refinement.

***

### cycle?

> `optional` **cycle?**: [`CycleBreakdown`](CycleBreakdown.md)

Defined in: model/types.ts:111

Value-add / non-value-add split of cycleTimeSec. Absent ⇒ not decomposed.

***

### cycleTimeSec

> **cycleTimeSec**: `number`

Defined in: model/types.ts:78

***

### dataQuality?

> `optional` **dataQuality?**: `Partial`\<`Record`\<[`StationDataField`](../type-aliases/StationDataField.md), [`DataQuality`](../type-aliases/DataQuality.md)\>\>

Defined in: model/types.ts:125

Per-field provenance for this station's numbers (spec §5). Sparse: a
 missing entry is treated as "estimated" at render, so an unmarked number
 reads as suspect rather than firm. Assigned at model entry, not at render.

***

### energyKw?

> `optional` **energyKw?**: `number`

Defined in: model/types.ts:109

Average power draw in kW (drives energy opex). Default 0.

***

### ergoRisk

> **ergoRisk**: [`ErgoRisk`](../type-aliases/ErgoRisk.md)

Defined in: model/types.ts:80

***

### fixed

> **fixed**: `boolean`

Defined in: model/types.ts:73

***

### h

> **h**: `number`

Defined in: model/types.ts:72

***

### id

> **id**: `string`

Defined in: model/types.ts:65

***

### inSide?

> `optional` **inSide?**: [`Side`](../type-aliases/Side.md)

Defined in: model/types.ts:88

Edge where material enters / exits / scrap leaves. Default left / right / bottom.

***

### mergeMode?

> `optional` **mergeMode?**: [`MergeMode`](../type-aliases/MergeMode.md)

Defined in: model/types.ts:103

How this step combines incoming flows. Default "sum".

***

### name

> **name**: `string`

Defined in: model/types.ts:66

***

### notes

> **notes**: `string`

Defined in: model/types.ts:82

***

### operators

> **operators**: `number`

Defined in: model/types.ts:77

***

### outSide?

> `optional` **outSide?**: [`Side`](../type-aliases/Side.md)

Defined in: model/types.ts:89

***

### parallelUnits?

> `optional` **parallelUnits?**: `number`

Defined in: model/types.ts:94

Number of identical parallel resources at this step. Default 1 (capacity ×N).

***

### partsPerCycle?

> `optional` **partsPerCycle?**: `number`

Defined in: model/types.ts:99

Parts processed together in ONE cycle — a multi-cavity die, a fixture that
 holds several parts, a batch oven. Multiplies the step's part throughput
 without adding a machine (unlike parallelUnits): its per-part time is the
 cycle divided by this. Default 1.

***

### provides?

> `optional` **provides?**: `string`[]

Defined in: model/types.ts:119

Capability ids this resource provides (spec §3.4). Drives gate 1 coverage:
 a cell needs capabilities, resources provide them, and it is the N:M
 relation that generates alternatives. Absent ⇒ provides nothing declared.

***

### role

> **role**: [`Role`](../type-aliases/Role.md)

Defined in: model/types.ts:67

***

### scrapRate?

> `optional` **scrapRate?**: `number`

Defined in: model/types.ts:92

Fraction of incoming parts scrapped at this step (0–1). Default 0.

***

### scrapSide?

> `optional` **scrapSide?**: [`Side`](../type-aliases/Side.md)

Defined in: model/types.ts:90

***

### shiftHours?

> `optional` **shiftHours?**: `number`

Defined in: model/types.ts:84

Per-station shift length in hours (Phase 2). Defaults to model/global 8h.

***

### splitMode?

> `optional` **splitMode?**: [`SplitMode`](../type-aliases/SplitMode.md)

Defined in: model/types.ts:101

How this step's output divides across outgoing flows. Default "distribute".

***

### type

> **type**: [`StationType`](../type-aliases/StationType.md)

Defined in: model/types.ts:68

***

### utilities

> **utilities**: `string`[]

Defined in: model/types.ts:81

***

### volumeBand?

> `optional` **volumeBand?**: `object`

Defined in: model/types.ts:121

Annual volume band this resource is validated for (spec §3.4, gate 2).

#### maxUnitsPerYear

> **maxUnitsPerYear**: `number`

#### minUnitsPerYear

> **minUnitsPerYear**: `number`

***

### w

> **w**: `number`

Defined in: model/types.ts:71

***

### weightKg?

> `optional` **weightKg?**: `number`

Defined in: model/types.ts:135

Equipment weight in kg (spec §12 floor_load). With a cell's floor-load
 capacity it flags a station too heavy for the slab. Absent ⇒ not checked.

***

### x

> **x**: `number`

Defined in: model/types.ts:69

***

### y

> **y**: `number`

Defined in: model/types.ts:70
