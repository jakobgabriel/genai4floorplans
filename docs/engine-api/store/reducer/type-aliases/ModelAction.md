# Type Alias: ModelAction

> **ModelAction** = \{ `model`: [`Model`](../../../model/types/interfaces/Model.md); `type`: `"SET_MODEL"`; \} \| \{ `name`: `string`; `type`: `"SET_NAME"`; \} \| \{ `gridH`: `number`; `gridW`: `number`; `type`: `"SET_GRID"`; \} \| \{ `shiftHours`: `number`; `type`: `"SET_SHIFT_HOURS"`; \} \| \{ `type`: `"SET_WEIGHTS"`; `weights`: [`RatingWeights`](../../../model/types/interfaces/RatingWeights.md) \| `undefined`; \} \| \{ `lossFactor`: `number` \| `undefined`; `type`: `"SET_LOSS_FACTOR"`; \} \| \{ `demand`: [`Demand`](../../../model/types/interfaces/Demand.md) \| `undefined`; `type`: `"SET_DEMAND"`; \} \| \{ `floorLoadKgPerM2`: `number` \| `undefined`; `type`: `"SET_FLOOR_LOAD"`; \} \| \{ `floorPolygon`: \[`number`, `number`\][] \| `undefined`; `type`: `"SET_FLOOR_POLYGON"`; \} \| \{ `patch`: `Partial`\<[`CostConfig`](../../../model/types/interfaces/CostConfig.md)\>; `type`: `"SET_COST_CONFIG"`; \} \| \{ `station`: [`Station`](../../../model/types/interfaces/Station.md); `type`: `"ADD_STATION"`; \} \| \{ `id`: `string`; `patch`: `Partial`\<[`Station`](../../../model/types/interfaces/Station.md)\>; `type`: `"UPDATE_STATION"`; \} \| \{ `cycle`: [`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md) \| `undefined`; `id`: `string`; `type`: `"SET_CYCLE_BREAKDOWN"`; \} \| \{ `id`: `string`; `patch`: `Partial`\<[`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)\>; `type`: `"PATCH_CYCLE_BREAKDOWN"`; \} \| \{ `id`: `string`; `type`: `"MOVE_STATION"`; `x`: `number`; `y`: `number`; \} \| \{ `newId`: `string`; `oldId`: `string`; `type`: `"RENAME_STATION"`; \} \| \{ `id`: `string`; `type`: `"DELETE_STATION"`; \} \| \{ `from`: `string`; `to`: `string`; `type`: `"ADD_FLOW"`; \} \| \{ `from`: `string`; `patch`: `Partial`\<[`Flow`](../../../model/types/interfaces/Flow.md)\>; `to`: `string`; `type`: `"UPDATE_FLOW"`; \} \| \{ `from`: `string`; `to`: `string`; `type`: `"REMOVE_FLOW"`; \} \| \{ `type`: `"ADD_NOGO"`; `zone`: [`NoGoZone`](../../../model/types/interfaces/NoGoZone.md); \} \| \{ `index`: `number`; `patch`: `Partial`\<[`NoGoZone`](../../../model/types/interfaces/NoGoZone.md)\>; `type`: `"UPDATE_NOGO"`; \} \| \{ `index`: `number`; `type`: `"REMOVE_NOGO"`; \} \| \{ `group`: [`Group`](../../../model/types/interfaces/Group.md); `type`: `"ADD_GROUP"`; \} \| \{ `id`: `string`; `patch`: `Partial`\<[`Group`](../../../model/types/interfaces/Group.md)\>; `type`: `"UPDATE_GROUP"`; \} \| \{ `id`: `string`; `type`: `"REMOVE_GROUP"`; \} \| \{ `form`: [`CellForm`](../../../engine/topology/type-aliases/CellForm.md); `type`: `"APPLY_TEMPLATE"`; \} \| \{ `elements`: [`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]; `type`: `"SET_WORK_ELEMENTS"`; \} \| \{ `element`: [`WorkElement`](../../../model/types/interfaces/WorkElement.md); `type`: `"ADD_WORK_ELEMENT"`; \} \| \{ `id`: `string`; `patch`: `Partial`\<[`WorkElement`](../../../model/types/interfaces/WorkElement.md)\>; `type`: `"UPDATE_WORK_ELEMENT"`; \} \| \{ `id`: `string`; `type`: `"DELETE_WORK_ELEMENT"`; \} \| \{ `mode`: [`VariantMode`](../../../model/types/interfaces/VariantMode.md); `type`: `"ADD_VARIANT_MODE"`; \} \| \{ `id`: `string`; `patch`: `Partial`\<[`VariantMode`](../../../model/types/interfaces/VariantMode.md)\>; `type`: `"UPDATE_VARIANT_MODE"`; \} \| \{ `id`: `string`; `type`: `"DELETE_VARIANT_MODE"`; \} \| \{ `itemIds`: `string`[]; `items`: [`ProposalItem`](../../../engine/proposal/interfaces/ProposalItem.md)[]; `type`: `"ACCEPT_PROPOSAL"`; \} \| \{ `flows`: [`Flow`](../../../model/types/interfaces/Flow.md)[]; `stations`: [`Station`](../../../model/types/interfaces/Station.md)[]; `type`: `"INSERT_SUBFLOW"`; `x`: `number`; `y`: `number`; \}

Defined in: store/reducer.ts:8

## Union Members

### Type Literal

\{ `model`: [`Model`](../../../model/types/interfaces/Model.md); `type`: `"SET_MODEL"`; \}

***

### Type Literal

\{ `name`: `string`; `type`: `"SET_NAME"`; \}

***

### Type Literal

\{ `gridH`: `number`; `gridW`: `number`; `type`: `"SET_GRID"`; \}

***

### Type Literal

\{ `shiftHours`: `number`; `type`: `"SET_SHIFT_HOURS"`; \}

***

### Type Literal

\{ `type`: `"SET_WEIGHTS"`; `weights`: [`RatingWeights`](../../../model/types/interfaces/RatingWeights.md) \| `undefined`; \}

***

### Type Literal

\{ `lossFactor`: `number` \| `undefined`; `type`: `"SET_LOSS_FACTOR"`; \}

***

### Type Literal

\{ `demand`: [`Demand`](../../../model/types/interfaces/Demand.md) \| `undefined`; `type`: `"SET_DEMAND"`; \}

***

### Type Literal

\{ `floorLoadKgPerM2`: `number` \| `undefined`; `type`: `"SET_FLOOR_LOAD"`; \}

***

### Type Literal

\{ `floorPolygon`: \[`number`, `number`\][] \| `undefined`; `type`: `"SET_FLOOR_POLYGON"`; \}

***

### Type Literal

\{ `patch`: `Partial`\<[`CostConfig`](../../../model/types/interfaces/CostConfig.md)\>; `type`: `"SET_COST_CONFIG"`; \}

***

### Type Literal

\{ `station`: [`Station`](../../../model/types/interfaces/Station.md); `type`: `"ADD_STATION"`; \}

***

### Type Literal

\{ `id`: `string`; `patch`: `Partial`\<[`Station`](../../../model/types/interfaces/Station.md)\>; `type`: `"UPDATE_STATION"`; \}

***

### Type Literal

\{ `cycle`: [`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md) \| `undefined`; `id`: `string`; `type`: `"SET_CYCLE_BREAKDOWN"`; \}

Set or clear a station's cycle decomposition (undefined = back to opaque).

***

### Type Literal

\{ `id`: `string`; `patch`: `Partial`\<[`CycleBreakdown`](../../../model/types/interfaces/CycleBreakdown.md)\>; `type`: `"PATCH_CYCLE_BREAKDOWN"`; \}

Edit one component; seeds the breakdown from cycleTimeSec if absent.

***

### Type Literal

\{ `id`: `string`; `type`: `"MOVE_STATION"`; `x`: `number`; `y`: `number`; \}

***

### Type Literal

\{ `newId`: `string`; `oldId`: `string`; `type`: `"RENAME_STATION"`; \}

***

### Type Literal

\{ `id`: `string`; `type`: `"DELETE_STATION"`; \}

***

### Type Literal

\{ `from`: `string`; `to`: `string`; `type`: `"ADD_FLOW"`; \}

***

### Type Literal

\{ `from`: `string`; `patch`: `Partial`\<[`Flow`](../../../model/types/interfaces/Flow.md)\>; `to`: `string`; `type`: `"UPDATE_FLOW"`; \}

***

### Type Literal

\{ `from`: `string`; `to`: `string`; `type`: `"REMOVE_FLOW"`; \}

***

### Type Literal

\{ `type`: `"ADD_NOGO"`; `zone`: [`NoGoZone`](../../../model/types/interfaces/NoGoZone.md); \}

***

### Type Literal

\{ `index`: `number`; `patch`: `Partial`\<[`NoGoZone`](../../../model/types/interfaces/NoGoZone.md)\>; `type`: `"UPDATE_NOGO"`; \}

***

### Type Literal

\{ `index`: `number`; `type`: `"REMOVE_NOGO"`; \}

***

### Type Literal

\{ `group`: [`Group`](../../../model/types/interfaces/Group.md); `type`: `"ADD_GROUP"`; \}

***

### Type Literal

\{ `id`: `string`; `patch`: `Partial`\<[`Group`](../../../model/types/interfaces/Group.md)\>; `type`: `"UPDATE_GROUP"`; \}

***

### Type Literal

\{ `id`: `string`; `type`: `"REMOVE_GROUP"`; \}

***

### Type Literal

\{ `form`: [`CellForm`](../../../engine/topology/type-aliases/CellForm.md); `type`: `"APPLY_TEMPLATE"`; \}

***

### Type Literal

\{ `elements`: [`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]; `type`: `"SET_WORK_ELEMENTS"`; \}

Replace the whole set in one commit — one undo step for "derive from stations".

***

### Type Literal

\{ `element`: [`WorkElement`](../../../model/types/interfaces/WorkElement.md); `type`: `"ADD_WORK_ELEMENT"`; \}

***

### Type Literal

\{ `id`: `string`; `patch`: `Partial`\<[`WorkElement`](../../../model/types/interfaces/WorkElement.md)\>; `type`: `"UPDATE_WORK_ELEMENT"`; \}

***

### Type Literal

\{ `id`: `string`; `type`: `"DELETE_WORK_ELEMENT"`; \}

***

### Type Literal

\{ `mode`: [`VariantMode`](../../../model/types/interfaces/VariantMode.md); `type`: `"ADD_VARIANT_MODE"`; \}

***

### Type Literal

\{ `id`: `string`; `patch`: `Partial`\<[`VariantMode`](../../../model/types/interfaces/VariantMode.md)\>; `type`: `"UPDATE_VARIANT_MODE"`; \}

***

### Type Literal

\{ `id`: `string`; `type`: `"DELETE_VARIANT_MODE"`; \}

***

### Type Literal

\{ `itemIds`: `string`[]; `items`: [`ProposalItem`](../../../engine/proposal/interfaces/ProposalItem.md)[]; `type`: `"ACCEPT_PROPOSAL"`; \}

Accept some or all items of a solver proposal (spec §4). Replaces the old
ADOPT_STATIONS, which took a finished station array and overwrote the
user's placements wholesale.

***

### Type Literal

\{ `flows`: [`Flow`](../../../model/types/interfaces/Flow.md)[]; `stations`: [`Station`](../../../model/types/interfaces/Station.md)[]; `type`: `"INSERT_SUBFLOW"`; `x`: `number`; `y`: `number`; \}

Insert a grouped/subflow element (node-RED subflow): its member stations and
internal flows are re-id'd, offset to the drop point and appended. Nothing
existing is touched, and ids never collide because each member gets a fresh
id. `stations` carry positions normalised to the group's own (0,0) corner.
