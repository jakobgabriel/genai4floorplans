# Interface: GenerateBrief

Defined in: engine/generate.ts:55

## Properties

### annualShifts?

> `optional` **annualShifts?**: `number`

Defined in: engine/generate.ts:60

***

### annualVolume

> **annualVolume**: `number`

Defined in: engine/generate.ts:59

Demand in good parts per year.

***

### concepts?

> `optional` **concepts?**: [`ConceptKind`](../../concepts/type-aliases/ConceptKind.md)[]

Defined in: engine/generate.ts:63

Restrict the sweep to these concepts. Defaults to all five.

***

### currency?

> `optional` **currency?**: `string`

Defined in: engine/generate.ts:64

***

### defaultPartWeightKg?

> `optional` **defaultPartWeightKg?**: `number`

Defined in: engine/generate.ts:78

Default part weight (kg) stamped on the generated flows. Default 1.

***

### defaultTransport?

> `optional` **defaultTransport?**: [`Transport`](../../../model/types/type-aliases/Transport.md)

Defined in: engine/generate.ts:76

Default transport mode for the generated inter-station flows. Falls back
 to the concept's transport when unset.

***

### demand?

> `optional` **demand?**: [`Demand`](../../../model/types/interfaces/Demand.md)

Defined in: engine/generate.ts:73

Multi-year demand + shift model. When present it is carried onto every
 generated model (capacity analysis) and its shift model overrides the
 scalar annualShifts/shiftHours where those are not separately given.

***

### laborCostPerHour?

> `optional` **laborCostPerHour?**: `number`

Defined in: engine/generate.ts:65

***

### name

> **name**: `string`

Defined in: engine/generate.ts:56

***

### programYears?

> `optional` **programYears?**: `number`

Defined in: engine/generate.ts:67

Program length used to amortise capex into the loaded cost per part.

***

### shiftHours?

> `optional` **shiftHours?**: `number`

Defined in: engine/generate.ts:61

***

### steps

> **steps**: [`ProcessStep`](ProcessStep.md)[]

Defined in: engine/generate.ts:57

***

### variantModes?

> `optional` **variantModes?**: [`VariantMode`](../../../model/types/interfaces/VariantMode.md)[]

Defined in: engine/generate.ts:69

Mix modes for mixed-model balancing (spec §3.2).
