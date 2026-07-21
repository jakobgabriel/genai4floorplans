# Function: seedBreakdown()

> **seedBreakdown**(`s`): [`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)

Defined in: engine/cycle.ts:190

Seed a breakdown from an opaque cycle time, so the editor has a starting
 point. All of it lands in value-add — deliberately optimistic, because the
 planner is then forced to move seconds out into the waste classes rather
 than accept a fabricated split.

## Parameters

### s

[`Station`](../../../model/types/interfaces/Station.md)

## Returns

[`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)
