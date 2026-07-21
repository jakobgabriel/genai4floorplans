# Type Alias: ZoneKind

> **ZoneKind** = `"blocking"` \| `"spacer"` \| `"aisle"` \| `"wall"` \| `"column"` \| `"esd"`

Defined in: model/types.ts:194

Non-station canvas elements. `blocking`/`wall`/`column` are obstacles the
 placement engine must avoid; `spacer`/`aisle`/`esd` are reserved space that
 does not block placement but is reported in the floor-space split. Absent
 kind ⇒ "blocking", so a legacy no-go zone stays an obstacle.
