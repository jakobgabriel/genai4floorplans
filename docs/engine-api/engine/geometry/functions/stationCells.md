# Function: stationCells()

> **stationCells**(`s`): `object`[]

Defined in: engine/geometry.ts:37

Absolute occupied cells of a station. Absent/empty mask ⇒ full w×h rectangle.
 Offsets outside the bounding box are ignored so resizing w/h stays robust.

## Parameters

### s

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"x"` \| `"y"` \| `"w"` \| `"h"` \| `"cells"`\>

## Returns

`object`[]
