# Interface: ProcessStep

Defined in: engine/generate.ts:21

## Properties

### attendedFraction?

> `optional` **attendedFraction?**: `number`

Defined in: engine/generate.ts:39

0–1 operator binding (drives operator/machine separation + automation).

***

### capabilityId?

> `optional` **capabilityId?**: `string`

Defined in: engine/generate.ts:33

Capability id chosen from the catalog rather than matched from the name.

***

### classification?

> `optional` **classification?**: [`WorkClass`](../../../model/types/type-aliases/WorkClass.md)

Defined in: engine/generate.ts:35

Value-add / necessary-NVA / waste classification of the work.

***

### confidence?

> `optional` **confidence?**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/generate.ts:45

Confidence in the cycle time.

***

### cycle?

> `optional` **cycle?**: [`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)

Defined in: engine/generate.ts:49

Per-part value-add / NVA decomposition. When set, cycle time = its sum.

***

### cycleTimeSec?

> `optional` **cycleTimeSec?**: `number`

Defined in: engine/generate.ts:25

Base manual cycle time in seconds; concepts scale it. Omit to have it
 inferred from the step name's matched capability.

***

### ergonomicLoad?

> `optional` **ergonomicLoad?**: [`ErgonomicLoad`](../../../model/types/type-aliases/ErgonomicLoad.md)

Defined in: engine/generate.ts:41

Physical load of the work.

***

### ergoRisk?

> `optional` **ergoRisk?**: [`ErgoRisk`](../../../model/types/type-aliases/ErgoRisk.md)

Defined in: engine/generate.ts:28

***

### name

> **name**: `string`

Defined in: engine/generate.ts:22

***

### partsPerCycle?

> `optional` **partsPerCycle?**: `number`

Defined in: engine/generate.ts:52

Parts processed together in one cycle (multi-cavity die, batch fixture).
 Default 1. Multiplies part throughput without adding a machine.

***

### predecessors?

> `optional` **predecessors?**: `number`[]

Defined in: engine/generate.ts:47

Predecessors as 0-based indices into the step list — expresses a DAG.

***

### scrapRate?

> `optional` **scrapRate?**: `number`

Defined in: engine/generate.ts:30

Fraction of parts scrapped at this step (0–1).

***

### timeMethod?

> `optional` **timeMethod?**: [`TimeMethod`](../../../model/types/type-aliases/TimeMethod.md)

Defined in: engine/generate.ts:43

How the cycle time was obtained.

***

### type?

> `optional` **type?**: [`StationType`](../../../model/types/type-aliases/StationType.md)

Defined in: engine/generate.ts:27

Overrides the concept's default station type when set.

***

### wasteClass?

> `optional` **wasteClass?**: [`WasteClass`](../../../model/types/type-aliases/WasteClass.md)

Defined in: engine/generate.ts:37

Which of the seven wastes, when NVA/NNVA.
