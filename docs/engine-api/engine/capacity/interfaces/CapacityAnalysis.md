# Interface: CapacityAnalysis

Defined in: engine/capacity.ts:23

## Properties

### availableSecPerYear

> **availableSecPerYear**: `number`

Defined in: engine/capacity.ts:28

Available productive seconds per year for one machine (after OEE).

***

### hasDemand

> **hasDemand**: `boolean`

Defined in: engine/capacity.ts:24

***

### machines

> **machines**: [`MachineCapacity`](MachineCapacity.md)[]

Defined in: engine/capacity.ts:29

***

### operatorsAllShifts

> **operatorsAllShifts**: `number`

Defined in: engine/capacity.ts:33

Operators across all shifts (per-shift × shifts/day).

***

### operatorsPerShift

> **operatorsPerShift**: `number`

Defined in: engine/capacity.ts:31

Operators at full manning, per shift, summed across process steps.

***

### peakYear

> **peakYear**: `number` \| `null`

Defined in: engine/capacity.ts:26

***

### years

> **years**: `number`[]

Defined in: engine/capacity.ts:25
