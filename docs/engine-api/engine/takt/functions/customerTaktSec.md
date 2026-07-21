# Function: customerTaktSec()

> **customerTaktSec**(`model`): `number`

Defined in: engine/takt.ts:23

Customer takt in seconds/part = net available production time ÷ demand
 (audit A-01, spec §9 "takt is the master constraint").

 Available time is the NET operating time from the shift model. Classical takt
 deliberately excludes OEE: performance/availability losses are absorbed by
 requiring the station cycle to sit *below* takt with margin, and OEE is
 applied where it belongs — machine-count sizing in `capacity.ts`. Baking OEE
 into takt would double-count the loss.

 Returns 0 when demand is unknown — an honest "no takt yet" rather than a
 fabricated number derived from the line's own output.

## Parameters

### model

`Pick`\<[`Model`](../../../model/types/interfaces/Model.md), `"demand"`\>

## Returns

`number`
