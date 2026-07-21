# Interface: ProcessCatalogEntry

Defined in: model/catalog.ts:28

A standard process the library offers. Fields mirror the PAUL catalog
 (standard cycle time, robustness, tariffs surrogate, space, tooling, machine
 invest, process id) plus the blueprint's building-block idea.

## Properties

### attendedFraction?

> `optional` **attendedFraction?**: `number`

Defined in: model/catalog.ts:46

Fraction of cycle that binds an operator; the rest is unattended machine
 time (ties to the balancer's attendedFraction). 1 = fully manual.

***

### capability?

> `optional` **capability?**: `string`

Defined in: model/catalog.ts:36

Capability this process provides (N:M to resources — never a 1:1 workcenter).

***

### category

> **category**: `string`

Defined in: model/catalog.ts:32

***

### custom?

> `optional` **custom?**: `boolean`

Defined in: model/catalog.ts:58

True for user-authored (non-predefined) entries. Absent ⇒ a seed building
 block. Lets "Reset to seed" and the documentation view distinguish the two.

***

### cycleTimeSec

> **cycleTimeSec**: `number`

Defined in: model/catalog.ts:38

Standard cycle time (seconds) and how firm that standard is.

***

### dataQuality?

> `optional` **dataQuality?**: [`DataQuality`](../../types/type-aliases/DataQuality.md)

Defined in: model/catalog.ts:39

***

### h?

> `optional` **h?**: `number`

Defined in: model/catalog.ts:49

***

### id

> **id**: `string`

Defined in: model/catalog.ts:29

***

### machineInvest?

> `optional` **machineInvest?**: `number`

Defined in: model/catalog.ts:52

***

### name

> **name**: `string`

Defined in: model/catalog.ts:31

Human name shown in the library and palette.

***

### notes?

> `optional` **notes?**: `string`

Defined in: model/catalog.ts:55

***

### processId?

> `optional` **processId?**: `string`

Defined in: model/catalog.ts:54

PE process-identification number, if governed.

***

### robustness?

> `optional` **robustness?**: [`Robustness`](../type-aliases/Robustness.md)

Defined in: model/catalog.ts:43

How process-robust this standard is (drives risk, not the grade).

***

### setupMin?

> `optional` **setupMin?**: `number`

Defined in: model/catalog.ts:41

Changeover / setup time (minutes).

***

### stationType

> **stationType**: [`StationType`](../../types/type-aliases/StationType.md)

Defined in: model/catalog.ts:34

The station type instantiated when this entry is placed.

***

### toolingCost?

> `optional` **toolingCost?**: `number`

Defined in: model/catalog.ts:51

Standard tooling cost and machine investment (cost units).

***

### w?

> `optional` **w?**: `number`

Defined in: model/catalog.ts:48

Footprint guide as grid cells (width × height).
