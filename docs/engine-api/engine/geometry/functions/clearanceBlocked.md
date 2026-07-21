# Function: clearanceBlocked()

> **clearanceBlocked**(`a`, `b`): `boolean`

Defined in: engine/geometry.ts:124

True if a's keep-clear zone is blocked by b's solid body (or vice versa).
 Two clearance zones may overlap — that is a shared aisle — but a machine body
 standing inside another's access margin is a real violation (audit C-03).

## Parameters

### a

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"x"` \| `"y"` \| `"w"` \| `"h"` \| `"clearance"`\>

### b

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"x"` \| `"y"` \| `"w"` \| `"h"` \| `"clearance"`\>

## Returns

`boolean`
