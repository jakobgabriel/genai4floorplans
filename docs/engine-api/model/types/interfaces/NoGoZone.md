# Interface: NoGoZone

Defined in: model/types.ts:199

## Properties

### h

> **h**: `number`

Defined in: model/types.ts:203

***

### kind?

> `optional` **kind?**: [`ZoneKind`](../type-aliases/ZoneKind.md)

Defined in: model/types.ts:206

What kind of reserved/blocked space this is. Absent ⇒ "blocking".

***

### label?

> `optional` **label?**: `string`

Defined in: model/types.ts:204

***

### movable?

> `optional` **movable?**: `boolean`

Defined in: model/types.ts:210

Envelope obstacle attributes (spec §14, audit C-03 inc2). `movable` marks
 an obstacle that could be relocated at a cost; `moveCost` is that cost in
 cost units. Absent ⇒ a fixed obstacle (a column, a wall).

***

### moveCost?

> `optional` **moveCost?**: `number`

Defined in: model/types.ts:211

***

### w

> **w**: `number`

Defined in: model/types.ts:202

***

### x

> **x**: `number`

Defined in: model/types.ts:200

***

### y

> **y**: `number`

Defined in: model/types.ts:201
