# Function: layoutRealism()

> **layoutRealism**(`model`): [`LayoutRealism`](../interfaces/LayoutRealism.md)

Defined in: engine/envelope.ts:56

Check a layout for the three realism constraints a flow-only rating ignores.
All are gated on data being present, so legacy models (no clearance, no
weight, no floor capacity) produce no false positives.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

## Returns

[`LayoutRealism`](../interfaces/LayoutRealism.md)
