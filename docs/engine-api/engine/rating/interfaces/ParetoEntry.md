# Interface: ParetoEntry

Defined in: engine/rating.ts:47

## Extends

- [`FlowDetail`](../../kpis/interfaces/FlowDetail.md)

## Properties

### cost

> **cost**: `number`

Defined in: engine/kpis.ts:6

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`cost`](../../kpis/interfaces/FlowDetail.md#cost)

***

### dist

> **dist**: `number`

Defined in: engine/kpis.ts:5

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`dist`](../../kpis/interfaces/FlowDetail.md#dist)

***

### from

> **from**: `string`

Defined in: model/types.ts:175

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`from`](../../kpis/interfaces/FlowDetail.md#from)

***

### kind?

> `optional` **kind?**: [`FlowKind`](../../../model/types/type-aliases/FlowKind.md)

Defined in: model/types.ts:187

Which of the four material paths this flow is. Absent ⇒ good part.

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`kind`](../../kpis/interfaces/FlowDetail.md#kind)

***

### notes

> **notes**: `string`

Defined in: model/types.ts:181

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`notes`](../../kpis/interfaces/FlowDetail.md#notes)

***

### partWeightKg

> **partWeightKg**: `number`

Defined in: model/types.ts:180

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`partWeightKg`](../../kpis/interfaces/FlowDetail.md#partweightkg)

***

### share

> **share**: `number`

Defined in: engine/rating.ts:48

Share (0–1) of the source's output routed here for a "distribute" split.

#### Overrides

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`share`](../../kpis/interfaces/FlowDetail.md#share)

***

### to

> **to**: `string`

Defined in: model/types.ts:176

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`to`](../../kpis/interfaces/FlowDetail.md#to)

***

### transport

> **transport**: [`Transport`](../../../model/types/type-aliases/Transport.md)

Defined in: model/types.ts:179

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`transport`](../../kpis/interfaces/FlowDetail.md#transport)

***

### travel

> **travel**: `number`

Defined in: engine/kpis.ts:7

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`travel`](../../kpis/interfaces/FlowDetail.md#travel)

***

### unitCost

> **unitCost**: `number`

Defined in: model/types.ts:178

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`unitCost`](../../kpis/interfaces/FlowDetail.md#unitcost)

***

### unitsPerAssembly?

> `optional` **unitsPerAssembly?**: `number`

Defined in: model/types.ts:185

Units of this input consumed per assembled unit at an "assemble" merge. Default 1.

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`unitsPerAssembly`](../../kpis/interfaces/FlowDetail.md#unitsperassembly)

***

### volume

> **volume**: `number`

Defined in: model/types.ts:177

#### Inherited from

[`FlowDetail`](../../kpis/interfaces/FlowDetail.md).[`volume`](../../kpis/interfaces/FlowDetail.md#volume)
