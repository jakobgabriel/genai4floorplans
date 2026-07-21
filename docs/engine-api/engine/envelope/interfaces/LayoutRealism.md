# Interface: LayoutRealism

Defined in: engine/envelope.ts:28

## Properties

### clearanceConflicts

> **clearanceConflicts**: \[`string`, `string`\][]

Defined in: engine/envelope.ts:33

Station-id pairs whose access clearance is blocked by the other's body.

***

### enclosed

> **enclosed**: `string`[]

Defined in: engine/envelope.ts:37

Process stations with no free path out to the floor boundary.

***

### issues

> **issues**: [`RealismIssue`](RealismIssue.md)[]

Defined in: engine/envelope.ts:29

***

### offFloor

> **offFloor**: `string`[]

Defined in: engine/envelope.ts:39

Stations whose footprint leaves the usable floor polygon (C-03 inc2).

***

### ok

> **ok**: `boolean`

Defined in: engine/envelope.ts:31

True when no error-level realism issue exists.

***

### overloaded

> **overloaded**: [`FloorLoad`](FloorLoad.md)[]

Defined in: engine/envelope.ts:35

Stations over the floor-load capacity.
