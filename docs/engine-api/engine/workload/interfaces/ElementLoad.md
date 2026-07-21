# Interface: ElementLoad

Defined in: engine/workload.ts:50

## Properties

### attendedSec

> **attendedSec**: `number`

Defined in: engine/workload.ts:65

Weighted operator-bound seconds (weightedSec × attendedFraction).

***

### classification

> **classification**: [`WorkClass`](../../../model/types/type-aliases/WorkClass.md)

Defined in: engine/workload.ts:53

***

### confidence

> **confidence**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/workload.ts:66

***

### elementId

> **elementId**: `string`

Defined in: engine/workload.ts:51

***

### ergonomicLoad

> **ergonomicLoad**: [`ErgonomicLoad`](../../../model/types/type-aliases/ErgonomicLoad.md)

Defined in: engine/workload.ts:56

***

### maxSec

> **maxSec**: `number`

Defined in: engine/workload.ts:60

Seconds in the heaviest mode — what station feasibility must use.

***

### name

> **name**: `string`

Defined in: engine/workload.ts:52

***

### skippedInModeIds

> **skippedInModeIds**: `string`[]

Defined in: engine/workload.ts:63

Modes in which this element is skipped entirely (multiplier 0).

***

### wasteClass?

> `optional` **wasteClass?**: [`WasteClass`](../../../model/types/type-aliases/WasteClass.md)

Defined in: engine/workload.ts:55

The seven-wastes tag, when the element is NNVA/NVA.

***

### weightedSec

> **weightedSec**: `number`

Defined in: engine/workload.ts:58

Mix-weighted mean seconds — what average throughput planning uses.

***

### worstModeId

> **worstModeId**: `string`

Defined in: engine/workload.ts:61
