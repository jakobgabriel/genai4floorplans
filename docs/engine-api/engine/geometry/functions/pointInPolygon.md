# Function: pointInPolygon()

> **pointInPolygon**(`px`, `py`, `poly`): `boolean`

Defined in: engine/geometry.ts:133

Point-in-polygon test (ray casting) for a closed polygon of grid points
 (audit C-03 inc2). Points on the boundary count as inside.

## Parameters

### px

`number`

### py

`number`

### poly

\[`number`, `number`\][]

## Returns

`boolean`
