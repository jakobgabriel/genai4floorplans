# Interface: AssignmentResult

Defined in: engine/assign.ts:39

## Properties

### balanceLossPct

> **balanceLossPct**: `number`

Defined in: engine/assign.ts:47

Total idle across stations, as a share of station-time.

***

### confidence

> **confidence**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/assign.ts:50

***

### issues

> **issues**: `string`[]

Defined in: engine/assign.ts:53

***

### method

> **method**: `"heuristic-rpw"`

Defined in: engine/assign.ts:49

***

### optimalityGapPct

> **optimalityGapPct**: `number`

Defined in: engine/assign.ts:45

(actual − theoretical) / theoretical, %. 0 = optimal station count.

***

### stations

> **stations**: [`AssignedStation`](AssignedStation.md)[]

Defined in: engine/assign.ts:40

***

### taktSec

> **taktSec**: `number`

Defined in: engine/assign.ts:41

***

### theoreticalMin

> **theoreticalMin**: `number`

Defined in: engine/assign.ts:43

Theoretical minimum stations: ceil(total work / takt).

***

### totalOperators

> **totalOperators**: `number`

Defined in: engine/assign.ts:48

***

### unassigned

> **unassigned**: `object`[]

Defined in: engine/assign.ts:52

Elements that could not be placed, with the reason.

#### elementId

> **elementId**: `string`

#### reason

> **reason**: `string`
