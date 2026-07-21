# Interface: FlowDetail

Defined in: engine/kpis.ts:4

## Extends

- [`Flow`](../../../model/types/interfaces/Flow.md)

## Extended by

- [`ParetoEntry`](../../rating/interfaces/ParetoEntry.md)

## Properties

### cost

> **cost**: `number`

Defined in: engine/kpis.ts:6

***

### dist

> **dist**: `number`

Defined in: engine/kpis.ts:5

***

### from

> **from**: `string`

Defined in: model/types.ts:175

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`from`](../../../model/types/interfaces/Flow.md#from)

***

### kind?

> `optional` **kind?**: [`FlowKind`](../../../model/types/type-aliases/FlowKind.md)

Defined in: model/types.ts:187

Which of the four material paths this flow is. Absent ⇒ good part.

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`kind`](../../../model/types/interfaces/Flow.md#kind)

***

### notes

> **notes**: `string`

Defined in: model/types.ts:181

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`notes`](../../../model/types/interfaces/Flow.md#notes)

***

### partWeightKg

> **partWeightKg**: `number`

Defined in: model/types.ts:180

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`partWeightKg`](../../../model/types/interfaces/Flow.md#partweightkg)

***

### share?

> `optional` **share?**: `number`

Defined in: model/types.ts:183

Share (0–1) of the source's output routed here for a "distribute" split.

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`share`](../../../model/types/interfaces/Flow.md#share)

***

### to

> **to**: `string`

Defined in: model/types.ts:176

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`to`](../../../model/types/interfaces/Flow.md#to)

***

### transport

> **transport**: [`Transport`](../../../model/types/type-aliases/Transport.md)

Defined in: model/types.ts:179

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`transport`](../../../model/types/interfaces/Flow.md#transport)

***

### travel

> **travel**: `number`

Defined in: engine/kpis.ts:7

***

### unitCost

> **unitCost**: `number`

Defined in: model/types.ts:178

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`unitCost`](../../../model/types/interfaces/Flow.md#unitcost)

***

### unitsPerAssembly?

> `optional` **unitsPerAssembly?**: `number`

Defined in: model/types.ts:185

Units of this input consumed per assembled unit at an "assemble" merge. Default 1.

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`unitsPerAssembly`](../../../model/types/interfaces/Flow.md#unitsperassembly)

***

### volume

> **volume**: `number`

Defined in: model/types.ts:177

#### Inherited from

[`Flow`](../../../model/types/interfaces/Flow.md).[`volume`](../../../model/types/interfaces/Flow.md#volume)
