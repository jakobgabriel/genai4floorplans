# Interface: DemandYear

Defined in: model/types.ts:369

Demand over a program horizon plus the shift model (PAUL Demands + Capa MA).
 Drives capacity: machines needed per year, operators per year. Independent of
 the layout — a cell can be evaluated against several years of demand.

## Properties

### units

> **units**: `number`

Defined in: model/types.ts:372

Units required that year (already includes any flex volume).

***

### year

> **year**: `number`

Defined in: model/types.ts:370
