# Interface: VariantMode

Defined in: model/types.ts:317

A mix mode — an abstract share of the workload with different work content.

Deliberately carries no product identity. Forty part numbers that need the
same work are one mode; a mode exists only where work content genuinely
differs.

## Properties

### elementOverrides

> **elementOverrides**: `Record`\<`string`, `number`\>

Defined in: model/types.ts:323

elementId → time multiplier. Absent ⇒ 1.0. Use 0 to skip the element.

***

### id

> **id**: `string`

Defined in: model/types.ts:318

***

### name

> **name**: `string`

Defined in: model/types.ts:319

***

### share

> **share**: `number`

Defined in: model/types.ts:321

Share of total output, 0–1. Shares across modes should sum to 1.
