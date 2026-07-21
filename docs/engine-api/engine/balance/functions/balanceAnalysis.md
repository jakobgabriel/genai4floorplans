# Function: balanceAnalysis()

> **balanceAnalysis**(`stations`, `flows`, `shiftHours?`, `taktSec?`): [`BalanceResult`](../interfaces/BalanceResult.md)

Defined in: engine/balance.ts:168

## Parameters

### stations

[`Station`](../../../model/types/interfaces/Station.md)[]

### flows

[`Flow`](../../../model/types/interfaces/Flow.md)[]

### shiftHours?

`number` = `DEFAULT_SHIFT_HOURS`

### taktSec?

`number` = `0`

Customer takt in seconds/part (net available time ÷ demand). Omit/0 when
 demand is unknown — the result's `takt` then stays 0 (audit A-01).

## Returns

[`BalanceResult`](../interfaces/BalanceResult.md)
