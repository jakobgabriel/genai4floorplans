# Interface: Flow

Defined in: model/types.ts:174

## Extended by

- [`FlowDetail`](../../../engine/kpis/interfaces/FlowDetail.md)

## Properties

### from

> **from**: `string`

Defined in: model/types.ts:175

***

### kind?

> `optional` **kind?**: [`FlowKind`](../type-aliases/FlowKind.md)

Defined in: model/types.ts:187

Which of the four material paths this flow is. Absent ⇒ good part.

***

### notes

> **notes**: `string`

Defined in: model/types.ts:181

***

### partWeightKg

> **partWeightKg**: `number`

Defined in: model/types.ts:180

***

### share?

> `optional` **share?**: `number`

Defined in: model/types.ts:183

Share (0–1) of the source's output routed here for a "distribute" split.

***

### to

> **to**: `string`

Defined in: model/types.ts:176

***

### transport

> **transport**: [`Transport`](../type-aliases/Transport.md)

Defined in: model/types.ts:179

***

### unitCost

> **unitCost**: `number`

Defined in: model/types.ts:178

***

### unitsPerAssembly?

> `optional` **unitsPerAssembly?**: `number`

Defined in: model/types.ts:185

Units of this input consumed per assembled unit at an "assemble" merge. Default 1.

***

### volume

> **volume**: `number`

Defined in: model/types.ts:177
