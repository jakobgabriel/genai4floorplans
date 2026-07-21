# Interface: FloorSpace

Defined in: engine/cost.ts:21

Floor space reported as two separate figures (blueprint §4.9). The cell area
 is planned; the bin/replenishment area routinely is not, and one combined
 number understates the footprint by a third. Units are m² when
 costConfig.cellAreaM2 is set, otherwise grid cells (`unit`).

## Properties

### cell

> **cell**: `number`

Defined in: engine/cost.ts:23

Area occupied by the stations themselves.

***

### factor

> **factor**: `number`

Defined in: engine/cost.ts:30

***

### materialSupply

> **materialSupply**: `number`

Defined in: engine/cost.ts:25

Extra area for material supply = cell × materialSupplyFactor.

***

### reserved

> **reserved**: `number`

Defined in: engine/cost.ts:27

Reserved space drawn on the canvas (spacer/aisle/esd zones). 0 when none.

***

### total

> **total**: `number`

Defined in: engine/cost.ts:29

cell + materialSupply + reserved — never shown alone, always with the split.

***

### unit

> **unit**: `"cells"` \| `"m²"`

Defined in: engine/cost.ts:31
