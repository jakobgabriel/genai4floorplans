# Interface: StationBuildOptions

Defined in: engine/generateCell.ts:78

## Properties

### auto?

> `optional` **auto?**: [`AutoState`](../../../model/types/type-aliases/AutoState.md)

Defined in: engine/generateCell.ts:90

Automation state imposed by the concept (overrides the attended-derived
 default). A transfer line's stations are `auto`, a manual bench's `manual`.

***

### capexPerStation?

> `optional` **capexPerStation?**: `number`

Defined in: engine/generateCell.ts:80

Indicative equipment cost per generated station.

***

### changeoverMin?

> `optional` **changeoverMin?**: `number`

Defined in: engine/generateCell.ts:82

***

### cycleFactor?

> `optional` **cycleFactor?**: `number`

Defined in: engine/generateCell.ts:84

Multiplier applied to every element's time before assignment.

***

### energyKw?

> `optional` **energyKw?**: `number`

Defined in: engine/generateCell.ts:81

***

### oneStationPerStep?

> `optional` **oneStationPerStep?**: `boolean`

Defined in: engine/generateCell.ts:87

Map each work element to its own station (guided-planner behaviour) rather
 than balancing/merging elements. Preserves the user's defined step list.

***

### operatorsPerStation?

> `optional` **operatorsPerStation?**: `number`

Defined in: engine/generateCell.ts:93

Operators manning each attended station, from the concept. A fully
 unattended station stays at 0 regardless. Overrides the derived count.
