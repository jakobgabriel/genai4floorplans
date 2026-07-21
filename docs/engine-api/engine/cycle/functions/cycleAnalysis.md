# Function: cycleAnalysis()

> **cycleAnalysis**(`stations`, `takt?`): [`CycleAnalysis`](../interfaces/CycleAnalysis.md)

Defined in: engine/cycle.ts:125

Per-station and line-level value-add analysis over the process steps.

`takt` (seconds/part, from balanceAnalysis) is optional; pass it to get
taktPct and the over-takt flag for a Yamazumi chart.

## Parameters

### stations

[`Station`](../../../model/types/interfaces/Station.md)[]

### takt?

`number`

## Returns

[`CycleAnalysis`](../interfaces/CycleAnalysis.md)
