# Function: clearanceRect()

> **clearanceRect**(`s`): `Rect`

Defined in: engine/geometry.ts:112

The footprint expanded by its keep-clear access margins (audit C-03). Absent
 clearance ⇒ the footprint itself. Clamped so a margin can't run negative.

## Parameters

### s

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"x"` \| `"y"` \| `"w"` \| `"h"` \| `"clearance"`\>

## Returns

`Rect`
