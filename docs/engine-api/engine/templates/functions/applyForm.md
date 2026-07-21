# Function: applyForm()

> **applyForm**(`model`, `form`): [`Station`](../../../model/types/interfaces/Station.md)[]

Defined in: engine/templates.ts:35

Reposition the movable stations into `form`: process steps onto the form's
slots, and — crucially — any MOVABLE input/output onto the form's own entry
and exit. A form is a flow path whose ends belong to it (a U-cell loads and
unloads side by side), so when the incoming/shipping areas are not pinned the
whole cell reshapes, not just its middle. Pinned I/O (a fixed dock, an anchored
staging bay) stay put. This is the single source of truth shared by the
APPLY_TEMPLATE reducer action and the rating/Optimize floor, so the preview
and the applied result are identical.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

### form

[`CellForm`](../../topology/type-aliases/CellForm.md)

## Returns

[`Station`](../../../model/types/interfaces/Station.md)[]
