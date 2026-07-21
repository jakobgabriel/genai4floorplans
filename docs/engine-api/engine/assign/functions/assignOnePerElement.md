# Function: assignOnePerElement()

> **assignOnePerElement**(`elements`, `taktSec`, `variantModes?`): [`AssignmentResult`](../interfaces/AssignmentResult.md)

Defined in: engine/assign.ts:349

One-to-one assignment: every work element becomes its own station, in the
order given. This is the mapping the guided planner uses — the user defines
discrete process steps and expects to see exactly those steps carried through
to the concept and the layout, not a balancer's merged subset. Takt still
drives operator manning and (via the caller) parallel lanes, so a station is
sized honestly; only the *merging* of distinct steps is suppressed.

## Parameters

### elements

[`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]

### taktSec

`number`

### variantModes?

[`VariantMode`](../../../model/types/interfaces/VariantMode.md)[]

## Returns

[`AssignmentResult`](../interfaces/AssignmentResult.md)
