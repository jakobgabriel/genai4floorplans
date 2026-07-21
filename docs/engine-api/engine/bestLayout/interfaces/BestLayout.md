# Interface: BestLayout

Defined in: engine/bestLayout.ts:25

## Properties

### cost

> **cost**: `number`

Defined in: engine/bestLayout.ts:32

Flow cost of `stations`.

***

### form

> **form**: [`CellForm`](../../topology/type-aliases/CellForm.md) \| `null`

Defined in: engine/bestLayout.ts:30

The form applied when strategy === "form"; null for a pairwise reposition.

***

### stations

> **stations**: [`Station`](../../../model/types/interfaces/Station.md)[]

Defined in: engine/bestLayout.ts:27

The lowest-flow-cost positions — same stations, relocated only.

***

### strategy

> **strategy**: [`BestStrategy`](../type-aliases/BestStrategy.md)

Defined in: engine/bestLayout.ts:28
