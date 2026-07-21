# Function: findImprovements()

> **findImprovements**(`model`, `opts?`): [`ImprovementReport`](../interfaces/ImprovementReport.md)

Defined in: engine/improve.ts:67

Rank what could still be improved about a cell.

Works on any model — generated or hand-drawn — because everything is derived
from the stations themselves rather than from a retained solver result.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

### opts?

#### restarts?

`number`

## Returns

[`ImprovementReport`](../interfaces/ImprovementReport.md)
