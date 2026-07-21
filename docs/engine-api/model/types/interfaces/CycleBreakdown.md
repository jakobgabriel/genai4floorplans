# Interface: CycleBreakdown

Defined in: model/types.ts:24

Per-part cycle time split into value-add and the four non-value-add classes.
 Optional: when absent a station is "not decomposed" and cycleTimeSec is the
 only truth. When present it is authoritative — normalizeStation keeps
 cycleTimeSec in sync with the sum, so every legacy reader stays correct.

## Properties

### handlingSec

> **handlingSec**: `number`

Defined in: model/types.ts:28

Load / unload / part presentation.

***

### setupSec

> **setupSec**: `number`

Defined in: model/types.ts:34

Changeover amortised over the batch.

***

### valueAddSec

> **valueAddSec**: `number`

Defined in: model/types.ts:26

Work that transforms the part. The only value-adding class.

***

### waitSec

> **waitSec**: `number`

Defined in: model/types.ts:32

Blocked or starved time inside the cycle.

***

### walkSec

> **walkSec**: `number`

Defined in: model/types.ts:30

Operator travel between stations.
