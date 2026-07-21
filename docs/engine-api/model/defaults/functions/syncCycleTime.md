# Function: syncCycleTime()

> **syncCycleTime**(`s`): [`Station`](../../types/interfaces/Station.md)

Defined in: model/defaults.ts:50

When a station carries a cycle breakdown, the breakdown is authoritative and
 cycleTimeSec mirrors its sum. Keeping the legacy scalar in sync means every
 existing reader (tooltips, CSV export, AI layout signature) stays correct
 without having to know about decomposition.

## Parameters

### s

[`Station`](../../types/interfaces/Station.md)

## Returns

[`Station`](../../types/interfaces/Station.md)
