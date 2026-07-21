# Interface: CostResult

Defined in: engine/cost.ts:34

## Properties

### automation

> **automation**: [`AutomationROI`](AutomationROI.md)[]

Defined in: engine/cost.ts:52

***

### capexTotal

> **capexTotal**: `number`

Defined in: engine/cost.ts:36

***

### costPerPart

> **costPerPart**: `number`

Defined in: engine/cost.ts:45

***

### currency

> **currency**: `string`

Defined in: engine/cost.ts:35

***

### energyPerShift

> **energyPerShift**: `number`

Defined in: engine/cost.ts:38

***

### floorSpace

> **floorSpace**: [`FloorSpace`](FloorSpace.md)

Defined in: engine/cost.ts:51

***

### laborPerShift

> **laborPerShift**: `number`

Defined in: engine/cost.ts:37

***

### ldcPerPart

> **ldcPerPart**: `number`

Defined in: engine/cost.ts:47

Labour-dependent cost per part (PAUL LDC) — operator time.

***

### lineOut

> **lineOut**: `number`

Defined in: engine/cost.ts:50

***

### maintenancePerShift

> **maintenancePerShift**: `number`

Defined in: engine/cost.ts:43

Maintenance/MRO + tooling per shift = capex × pct/yr ÷ annual shifts (C-08).

***

### mdcPerPart

> **mdcPerPart**: `number`

Defined in: engine/cost.ts:49

Machine-dependent cost per part (PAUL MDC) — energy + transport.

***

### opexPerShift

> **opexPerShift**: `number`

Defined in: engine/cost.ts:44

***

### spacePerShift

> **spacePerShift**: `number`

Defined in: engine/cost.ts:41

Floor-occupancy cost per shift = floor area × €/m²·yr ÷ annual shifts (C-08).

***

### transportPerShift

> **transportPerShift**: `number`

Defined in: engine/cost.ts:39
