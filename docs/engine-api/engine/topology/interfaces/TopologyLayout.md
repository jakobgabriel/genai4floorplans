# Interface: TopologyLayout

Defined in: engine/topology.ts:37

## Properties

### entry

> **entry**: [`Slot`](Slot.md)

Defined in: engine/topology.ts:41

Where the incoming/staging area belongs for this form.

***

### entryExitAdjacent

> **entryExitAdjacent**: `boolean`

Defined in: engine/topology.ts:47

True when entry and exit sit at the same end — the U-cell property.

***

### exit

> **exit**: [`Slot`](Slot.md)

Defined in: engine/topology.ts:43

Where the outgoing/shipping area belongs for this form.

***

### legs

> **legs**: `number`

Defined in: engine/topology.ts:45

Straight runs in the path. I=1, L=2, U=2, S=rows.

***

### slots

> **slots**: [`Slot`](Slot.md)[]

Defined in: engine/topology.ts:39

Process-station slots, in flow order.
