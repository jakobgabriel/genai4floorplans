# Interface: StationCycle

Defined in: engine/cycle.ts:61

## Properties

### cycleSec

> **cycleSec**: `number`

Defined in: engine/cycle.ts:69

The station's full machine cycle (all parts). totalSec = cycleSec / partsPerCycle.

***

### decomposed

> **decomposed**: `boolean`

Defined in: engine/cycle.ts:65

False when the station still carries only an opaque cycleTimeSec.

***

### id

> **id**: `string`

Defined in: engine/cycle.ts:62

***

### name

> **name**: `string`

Defined in: engine/cycle.ts:63

***

### nonValueAddSec

> **nonValueAddSec**: `number`

Defined in: engine/cycle.ts:75

***

### overTakt

> **overTakt**: `boolean`

Defined in: engine/cycle.ts:81

True when the station cannot meet takt on its own.

***

### partsPerCycle

> **partsPerCycle**: `number`

Defined in: engine/cycle.ts:67

Parts processed per cycle (≥1). >1 ⇒ totalSec/segments are PER PART.

***

### segments

> **segments**: [`CycleSegment`](CycleSegment.md)[]

Defined in: engine/cycle.ts:73

Empty when not decomposed — callers must not invent a split.

***

### taktPct

> **taktPct**: `number` \| `null`

Defined in: engine/cycle.ts:79

Share of takt this station consumes. null when takt is unknown.

***

### totalSec

> **totalSec**: `number`

Defined in: engine/cycle.ts:71

Per-PART cycle time (machine cycle ÷ partsPerCycle), for takt comparison.

***

### valueAddPct

> **valueAddPct**: `number` \| `null`

Defined in: engine/cycle.ts:77

null when not decomposed, so the UI can say "unknown" instead of "0%".

***

### valueAddSec

> **valueAddSec**: `number`

Defined in: engine/cycle.ts:74
