# Function: cellTopology()

> **cellTopology**(`form`, `n`, `grid`): [`TopologyLayout`](../interfaces/TopologyLayout.md)

Defined in: engine/topology.ts:76

Lay out `n` process stations in the given form, plus the entry and exit that
belong to that form.

Coordinates are grid cells. The caller is responsible for keeping the whole
result inside its own margins.

## Parameters

### form

[`CellForm`](../type-aliases/CellForm.md)

### n

`number`

### grid

`Grid`

## Returns

[`TopologyLayout`](../interfaces/TopologyLayout.md)
