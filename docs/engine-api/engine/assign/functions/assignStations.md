# Function: assignStations()

> **assignStations**(`elements`, `taktSec`, `variantModes?`, `opts?`): [`AssignmentResult`](../interfaces/AssignmentResult.md)

Defined in: engine/assign.ts:71

Assign elements to stations for a given takt.

Mixed-model aware: station feasibility uses the WORST mode's time, because a
station that only fits on average starves the line whenever the heavy variant
runs. Weighted time is carried alongside for throughput and cost.

## Parameters

### elements

[`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]

### taktSec

`number`

### variantModes?

[`VariantMode`](../../../model/types/interfaces/VariantMode.md)[]

### opts?

#### maxStations?

`number`

## Returns

[`AssignmentResult`](../interfaces/AssignmentResult.md)
