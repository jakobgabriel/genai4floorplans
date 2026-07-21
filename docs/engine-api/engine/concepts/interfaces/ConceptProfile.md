# Interface: ConceptProfile

Defined in: engine/concepts.ts:19

## Properties

### allowsParallel

> **allowsParallel**: `boolean`

Defined in: engine/concepts.ts:33

May duplicate a step into parallel lanes to reach takt.

***

### auto

> **auto**: [`AutoState`](../../../model/types/type-aliases/AutoState.md)

Defined in: engine/concepts.ts:28

Automation state applied to generated process steps.

***

### blurb

> **blurb**: `string`

Defined in: engine/concepts.ts:22

***

### capexPerStation

> **capexPerStation**: `number`

Defined in: engine/concepts.ts:35

Indicative equipment cost per step, in cost units.

***

### changeoverMin

> **changeoverMin**: `number`

Defined in: engine/concepts.ts:44

Changeover minutes per step — automation trades flexibility for speed.

***

### cycleFactor

> **cycleFactor**: `number`

Defined in: engine/concepts.ts:37

Cycle-time multiplier vs. the quoted manual base time.

***

### energyKw

> **energyKw**: `number`

Defined in: engine/concepts.ts:42

Average power draw per step, kW.

***

### ergoRisk

> **ergoRisk**: [`ErgoRisk`](../../../model/types/type-aliases/ErgoRisk.md)

Defined in: engine/concepts.ts:45

***

### forms

> **forms**: [`CellForm`](../../topology/type-aliases/CellForm.md)[]

Defined in: engine/concepts.ts:26

Cell forms this concept tends to use, best first.

***

### handlingShare

> **handlingShare**: `number`

Defined in: engine/concepts.ts:39

Handling share of the resulting cycle (drives the decomposition).

***

### kind

> **kind**: [`ConceptKind`](../type-aliases/ConceptKind.md)

Defined in: engine/concepts.ts:20

***

### label

> **label**: `string`

Defined in: engine/concepts.ts:21

***

### operatorsPerStation

> **operatorsPerStation**: `number`

Defined in: engine/concepts.ts:31

Operators manning each process step.

***

### stationType

> **stationType**: [`StationType`](../../../model/types/type-aliases/StationType.md)

Defined in: engine/concepts.ts:29

***

### transport

> **transport**: [`Transport`](../../../model/types/type-aliases/Transport.md)

Defined in: engine/concepts.ts:40

***

### viableVolume

> **viableVolume**: \[`number`, `number`\]

Defined in: engine/concepts.ts:24

Annual volume band where this concept is normally sensible.
