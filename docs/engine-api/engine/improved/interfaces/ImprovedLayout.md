# Interface: ImprovedLayout

Defined in: engine/improved.ts:27

## Properties

### better

> **better**: `boolean`

Defined in: engine/improved.ts:36

True when the improved layout is materially better than the current one.

***

### deltas

> **deltas**: `object`

Defined in: engine/improved.ts:37

#### flowCostAfter

> **flowCostAfter**: `number`

#### flowCostBefore

> **flowCostBefore**: `number`

#### flowCostPct

> **flowCostPct**: `number`

Negative = improvement.

#### moved

> **moved**: `number`

Stations that moved.

#### travelAfter

> **travelAfter**: `number`

#### travelBefore

> **travelBefore**: `number`

#### travelPct

> **travelPct**: `number`

***

### form

> **form**: [`CellForm`](../../topology/type-aliases/CellForm.md) \| `null`

Defined in: engine/improved.ts:32

The form applied when strategy === "form"; null otherwise.

***

### rationale

> **rationale**: `string`

Defined in: engine/improved.ts:34

Plain-language reason and predicted effect (§4, Law 6).

***

### stations

> **stations**: [`Station`](../../../model/types/interfaces/Station.md)[]

Defined in: engine/improved.ts:29

The improved positions — same stations, same count, relocated only.

***

### strategy

> **strategy**: [`ImproveStrategy`](../type-aliases/ImproveStrategy.md)

Defined in: engine/improved.ts:30
