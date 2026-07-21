# Function: hasCollision()

> **hasCollision**(`s`, `x`, `y`, `others`, `zones`): `boolean`

Defined in: engine/geometry.ts:73

True if placing `s` at (x,y) would collide with any other station or no-go zone.
 Uses cell-accurate testing when a freeform footprint is involved; otherwise the
 fast rectangle path (so all-rectangle models behave exactly as before).

## Parameters

### s

[`Station`](../../../model/types/interfaces/Station.md)

### x

`number`

### y

`number`

### others

[`Station`](../../../model/types/interfaces/Station.md)[]

### zones

[`NoGoZone`](../../../model/types/interfaces/NoGoZone.md)[]

## Returns

`boolean`
