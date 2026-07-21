# Interface: Improvement

Defined in: engine/improve.ts:31

## Properties

### confidence

> **confidence**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/improve.ts:43

***

### detail

> **detail**: `string`

Defined in: engine/improve.ts:34

***

### impact

> **impact**: `number`

Defined in: engine/improve.ts:42

0–100, for ranking. Throughput beats labour beats distance.

***

### kind

> **kind**: [`ImprovementKind`](../type-aliases/ImprovementKind.md)

Defined in: engine/improve.ts:32

***

### secondsSaved

> **secondsSaved**: `number`

Defined in: engine/improve.ts:40

Cycle seconds recoverable.

***

### stationsSaved

> **stationsSaved**: `number`

Defined in: engine/improve.ts:38

Stations that could be removed.

***

### targetIds

> **targetIds**: `string`[]

Defined in: engine/improve.ts:45

Station ids the suggestion applies to.

***

### throughputGain

> **throughputGain**: `number`

Defined in: engine/improve.ts:36

Extra parts/shift if taken. 0 when the gain is cost, not throughput.

***

### title

> **title**: `string`

Defined in: engine/improve.ts:33
