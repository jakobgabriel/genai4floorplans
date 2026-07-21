# Interface: CapabilityHint

Defined in: engine/infer.ts:19

## Properties

### attendedFraction

> **attendedFraction**: `number`

Defined in: engine/infer.ts:26

How much of the duration binds an operator.

***

### capabilityId

> **capabilityId**: `string`

Defined in: engine/infer.ts:21

Capability id the keyword maps to.

***

### category

> **category**: `"join"` \| `"form"` \| `"cut"` \| `"inspect"` \| `"handle"` \| `"mark"` \| `"test"` \| `"transport"` \| `"surface"`

Defined in: engine/infer.ts:22

***

### classification

> **classification**: [`WorkClass`](../../../model/types/type-aliases/WorkClass.md)

Defined in: engine/infer.ts:23

***

### defaultSeconds

> **defaultSeconds**: `number`

Defined in: engine/infer.ts:29

Fallback duration when the planner gave no time.

***

### ergonomicLoad

> **ergonomicLoad**: [`ErgonomicLoad`](../../../model/types/type-aliases/ErgonomicLoad.md)

Defined in: engine/infer.ts:27

***

### keywords

> **keywords**: `string`[]

Defined in: engine/infer.ts:30

***

### wasteClass?

> `optional` **wasteClass?**: [`WasteClass`](../../../model/types/type-aliases/WasteClass.md)

Defined in: engine/infer.ts:24
