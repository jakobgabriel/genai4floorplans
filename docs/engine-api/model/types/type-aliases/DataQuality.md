# Type Alias: DataQuality

> **DataQuality** = `"measured"` \| `"benchmarked"` \| `"estimated"`

Defined in: model/types.ts:50

Provenance of a single stored number (spec §5, fixes Excel failure F8 —
 "no confidence signal"). Rendered always-visible: `estimated` draws as a
 hatched range, the firmer two as a point. A number's confidence must be
 assigned when it enters the model, never inferred at render.
