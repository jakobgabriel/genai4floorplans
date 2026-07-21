# Interface: WorkElement

Defined in: model/types.ts:281

## Properties

### attendedFraction

> **attendedFraction**: `number`

Defined in: model/types.ts:295

1.0 = the operator is bound for the whole duration; 0 = fully unattended.
 This is what makes operator/machine separation and chaku-chaku loops
 computable — without it, balancing is wrong for any semi-automated cell.

***

### capabilityId?

> `optional` **capabilityId?**: `string`

Defined in: model/types.ts:285

Capability required to perform it (master data id).

***

### classification

> **classification**: [`WorkClass`](../type-aliases/WorkClass.md)

Defined in: model/types.ts:289

***

### ergonomicLoad

> **ergonomicLoad**: [`ErgonomicLoad`](../type-aliases/ErgonomicLoad.md)

Defined in: model/types.ts:297

***

### fixedStationId?

> `optional` **fixedStationId?**: `string`

Defined in: model/types.ts:307

***

### id

> **id**: `string`

Defined in: model/types.ts:282

***

### mustBeSameStationAs?

> `optional` **mustBeSameStationAs?**: `string`[]

Defined in: model/types.ts:305

Zoning constraints for the balancer.

***

### mustNotBeSameStationAs?

> `optional` **mustNotBeSameStationAs?**: `string`[]

Defined in: model/types.ts:306

***

### name

> **name**: `string`

Defined in: model/types.ts:283

***

### partsPerCycle?

> `optional` **partsPerCycle?**: `number`

Defined in: model/types.ts:303

Parts processed together in one cycle (a multi-cavity op). Absent ⇒ 1.
 Its per-part time for balancing is the element time divided by this.

***

### predecessors

> **predecessors**: `string`[]

Defined in: model/types.ts:287

Precedence is a DAG, not a linear routing.

***

### scrapRate?

> `optional` **scrapRate?**: `number`

Defined in: model/types.ts:300

Fraction of parts scrapped performing this element (0–1). Absent ⇒ 0.
 A station inherits the max scrap of the elements assigned to it.

***

### skillClass?

> `optional` **skillClass?**: `string`

Defined in: model/types.ts:296

***

### time

> **time**: [`ElementTime`](ElementTime.md)

Defined in: model/types.ts:288

***

### wasteClass?

> `optional` **wasteClass?**: [`WasteClass`](../type-aliases/WasteClass.md)

Defined in: model/types.ts:291

Only meaningful when classification is NVA/NNVA.
