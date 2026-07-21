# Interface: Model

Defined in: model/types.ts:394

## Properties

### aisleWidth?

> `optional` **aisleWidth?**: `number`

Defined in: model/types.ts:427

Minimum aisle / egress width in grid cells (audit C-03). Used to check
 that every station keeps a walkable path to the floor boundary. Absent ⇒
 DEFAULT_AISLE_WIDTH is used only when a clearance/egress check runs.

***

### capabilities?

> `optional` **capabilities?**: [`Capability`](../../capabilities/interfaces/Capability.md)[]

Defined in: model/types.ts:435

Governed capability catalog for this cell (spec §12, audit C-01). Absent ⇒
 the seeded DEFAULT_CAPABILITIES are used, so coverage works offline.

***

### conceptKind?

> `optional` **conceptKind?**: `string`

Defined in: model/types.ts:417

Which manufacturing concept this cell represents (engine/concepts.ts).
 Purely descriptive — the rating does not read it.

***

### costConfig?

> `optional` **costConfig?**: [`CostConfig`](CostConfig.md)

Defined in: model/types.ts:405

Cost/ROI assumptions (defaults applied in the cost engine).

***

### demand?

> `optional` **demand?**: [`Demand`](Demand.md)

Defined in: model/types.ts:419

Multi-year demand + shift model, for capacity analysis (PAUL Capa MA/HC).

***

### floorLoadKgPerM2?

> `optional` **floorLoadKgPerM2?**: `number`

Defined in: model/types.ts:423

Floor slab load capacity in kg/m² (spec §12/§14 envelope, audit C-03).
 A station whose weight ÷ footprint area exceeds this is flagged. Absent ⇒
 the floor-load check is skipped (no false positives on legacy models).

***

### floorPolygon?

> `optional` **floorPolygon?**: \[`number`, `number`\][]

Defined in: model/types.ts:432

Usable floor outline as a closed polygon of grid points (spec §14 envelope,
 audit C-03 inc2). Lets the floor be a non-rectangular shape: a station whose
 footprint leaves the polygon is flagged and the optimiser won't move one
 out. Absent ⇒ the full grid rectangle is usable.

***

### flows

> **flows**: [`Flow`](Flow.md)[]

Defined in: model/types.ts:407

***

### gridH

> **gridH**: `number`

Defined in: model/types.ts:399

***

### gridW

> **gridW**: `number`

Defined in: model/types.ts:398

***

### groups?

> `optional` **groups?**: [`Group`](Group.md)[]

Defined in: model/types.ts:442

Documentation annotations — labelled/commented boxes around machines. Purely
 informational; they never affect placement, flow or the rating. Absent ⇒ none.

***

### lossFactor?

> `optional` **lossFactor?**: `number`

Defined in: model/types.ts:414

Balancing loss factor (spec / IE blueprint). Carries walking, reaching,
 handling and balancing loss — none of which appears in a standard time —
 so the calculated station count is (work content ÷ takt) × lossFactor.
 Stored as a constant so it is neither measured nor forgotten. Absent ⇒
 DEFAULT_LOSS_FACTOR.

***

### name

> **name**: `string`

Defined in: model/types.ts:397

***

### noGoZones

> **noGoZones**: [`NoGoZone`](NoGoZone.md)[]

Defined in: model/types.ts:408

***

### schemaVersion?

> `optional` **schemaVersion?**: `number`

Defined in: model/types.ts:396

Bumped by migrations in model/migrate.ts. Absent in legacy/demo files.

***

### shiftHours?

> `optional` **shiftHours?**: `number`

Defined in: model/types.ts:401

Default shift length applied when a station omits shiftHours.

***

### stations

> **stations**: [`Station`](Station.md)[]

Defined in: model/types.ts:406

***

### variantModes?

> `optional` **variantModes?**: [`VariantMode`](VariantMode.md)[]

Defined in: model/types.ts:439

Mix modes for mixed-model balancing. Absent/empty ⇒ single-model.

***

### weights?

> `optional` **weights?**: [`RatingWeights`](RatingWeights.md)

Defined in: model/types.ts:403

Composite-rating weight override. Falls back to engine WEIGHTS when absent.

***

### workElements?

> `optional` **workElements?**: [`WorkElement`](WorkElement.md)[]

Defined in: model/types.ts:437

Product-free workload: what must be done, independent of what is made.
