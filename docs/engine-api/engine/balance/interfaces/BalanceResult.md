# Interface: BalanceResult

Defined in: engine/balance.ts:32

## Properties

### bottleneck

> **bottleneck**: [`BalanceStep`](BalanceStep.md) \| `null`

Defined in: engine/balance.ts:34

***

### criticalPath

> **criticalPath**: `string`[]

Defined in: engine/balance.ts:47

Longest cumulative-cycle route through the flow (station ids, source→end).

***

### lineCycleSec

> **lineCycleSec**: `number`

Defined in: engine/balance.ts:45

Achieved line pace in seconds/part = available time ÷ actual output. What
 the line currently does, NOT what the customer needs. Kept distinct from
 `takt` so the two are never conflated (the old code called this "takt").

***

### lineOut

> **lineOut**: `number`

Defined in: engine/balance.ts:35

***

### maxRate

> **maxRate**: `number`

Defined in: engine/balance.ts:36

***

### score

> **score**: `number`

Defined in: engine/balance.ts:37

***

### steps

> **steps**: [`BalanceStep`](BalanceStep.md)[]

Defined in: engine/balance.ts:33

***

### syncWaits

> **syncWaits**: [`SyncWait`](SyncWait.md)[]

Defined in: engine/balance.ts:49

Synchronized merges where faster branches idle waiting on the slowest.

***

### takt

> **takt**: `number`

Defined in: engine/balance.ts:41

Customer takt in seconds/part = net available time ÷ demand (audit A-01).
 0 when demand is unknown — the honest signal that there is no takt to hit
 yet, rather than a fabricated one. This is the line the Yamazumi draws.
