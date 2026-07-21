# Function: footprintInPolygon()

> **footprintInPolygon**(`s`, `poly`): `boolean`

Defined in: engine/geometry.ts:148

True when a station footprint lies entirely inside the floor polygon (all
 four corners), so the machine sits on usable floor (audit C-03 inc2). An
 empty/degenerate polygon means "no envelope declared" → always inside.

## Parameters

### s

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"x"` \| `"y"` \| `"w"` \| `"h"`\>

### poly

\[`number`, `number`\][]

## Returns

`boolean`
