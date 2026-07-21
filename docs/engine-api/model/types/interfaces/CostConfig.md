# Interface: CostConfig

Defined in: model/types.ts:147

Cost assumptions for the ROI model. Informational — not in the composite.

## Properties

### annualShifts?

> `optional` **annualShifts?**: `number`

Defined in: model/types.ts:150

***

### cellAreaM2?

> `optional` **cellAreaM2?**: `number`

Defined in: model/types.ts:154

Physical area of one grid cell, m². Lets floor space report in m² instead
 of abstract grid cells. Absent ⇒ figures are in grid cells.

***

### currency?

> `optional` **currency?**: `string`

Defined in: model/types.ts:151

***

### energyCostPerKwh?

> `optional` **energyCostPerKwh?**: `number`

Defined in: model/types.ts:149

***

### laborCostPerHour?

> `optional` **laborCostPerHour?**: `number`

Defined in: model/types.ts:148

***

### maintenancePctOfCapexPerYear?

> `optional` **maintenancePctOfCapexPerYear?**: `number`

Defined in: model/types.ts:165

Annual maintenance/MRO + tooling as a fraction of equipment capex — the
 standard estimate when a detailed tooling model is absent (audit C-08).
 Absent ⇒ DEFAULT_COST_CONFIG.maintenancePctOfCapexPerYear.

***

### materialSupplyFactor?

> `optional` **materialSupplyFactor?**: `number`

Defined in: model/types.ts:157

Extra floor for bins and replenishment, as a fraction of the cell area.
 The blueprint's "forgotten 30-40 %". Absent ⇒ DEFAULT_MATERIAL_SUPPLY_FACTOR.

***

### spaceCostPerM2Year?

> `optional` **spaceCostPerM2Year?**: `number`

Defined in: model/types.ts:161

Annual occupancy cost per m² of floor (rent, utilities, overhead). Floor
 space was measured but never charged (audit C-08); this turns it into an
 opex line. Absent ⇒ DEFAULT_COST_CONFIG.spaceCostPerM2Year.
