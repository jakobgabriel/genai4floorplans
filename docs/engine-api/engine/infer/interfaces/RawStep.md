# Interface: RawStep

Defined in: engine/infer.ts:188

## Properties

### attendedFraction?

> `optional` **attendedFraction?**: `number`

Defined in: engine/infer.ts:201

0–1 operator binding.

***

### capabilityId?

> `optional` **capabilityId?**: `string`

Defined in: engine/infer.ts:197

Capability id, chosen from the catalog rather than matched from the name.

***

### classification?

> `optional` **classification?**: [`WorkClass`](../../../model/types/type-aliases/WorkClass.md)

Defined in: engine/infer.ts:198

***

### confidence?

> `optional` **confidence?**: [`Confidence`](../../../model/types/type-aliases/Confidence.md)

Defined in: engine/infer.ts:205

***

### cycle?

> `optional` **cycle?**: [`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)

Defined in: engine/infer.ts:209

Per-part value-add / NVA split. When present, seconds = its sum.

***

### ergonomicLoad?

> `optional` **ergonomicLoad?**: [`ErgonomicLoad`](../../../model/types/type-aliases/ErgonomicLoad.md)

Defined in: engine/infer.ts:202

***

### name

> **name**: `string`

Defined in: engine/infer.ts:189

***

### partsPerCycle?

> `optional` **partsPerCycle?**: `number`

Defined in: engine/infer.ts:213

Parts processed together in one cycle (multi-cavity). Absent ⇒ 1.

***

### predecessors?

> `optional` **predecessors?**: `number`[]

Defined in: engine/infer.ts:207

Predecessors as 0-based indices into the step list. Absent ⇒ linear chain.

***

### scrapRate?

> `optional` **scrapRate?**: `number`

Defined in: engine/infer.ts:211

Fraction of parts scrapped at this step (0–1). Absent ⇒ 0.

***

### seconds?

> `optional` **seconds?**: `number`

Defined in: engine/infer.ts:191

Omit to have it inferred from the matched capability.

***

### timeMethod?

> `optional` **timeMethod?**: [`TimeMethod`](../../../model/types/type-aliases/TimeMethod.md)

Defined in: engine/infer.ts:204

How the time was obtained, and how much to trust it.

***

### wasteClass?

> `optional` **wasteClass?**: [`WasteClass`](../../../model/types/type-aliases/WasteClass.md)

Defined in: engine/infer.ts:199
