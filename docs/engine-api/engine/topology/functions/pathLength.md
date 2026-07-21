# Function: pathLength()

> **pathLength**(`layout`): `number`

Defined in: engine/topology.ts:237

Rectilinear path length through the whole cell, entry → stations → exit.

The check that a form is genuinely being followed: a U must be materially
shorter than a straight line over the same station count, because the return
leg brings the exit back to the entry. If it is not, the form is decorative.

## Parameters

### layout

[`TopologyLayout`](../interfaces/TopologyLayout.md)

## Returns

`number`
