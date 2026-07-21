# Function: stationsFromAssignment()

> **stationsFromAssignment**(`assignment`, `elements`, `variantModes`, `opts?`): [`Station`](../../../model/types/interfaces/Station.md)[]

Defined in: engine/generateCell.ts:102

Turn an assignment into layout-model stations.

Positions are left at 0,0 — the caller places them with a topology template,
because placement is a separate concern (and a separate solver).

## Parameters

### assignment

[`AssignmentResult`](../../assign/interfaces/AssignmentResult.md)

### elements

[`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]

### variantModes

[`VariantMode`](../../../model/types/interfaces/VariantMode.md)[] \| `undefined`

### opts?

[`StationBuildOptions`](../interfaces/StationBuildOptions.md) = `{}`

## Returns

[`Station`](../../../model/types/interfaces/Station.md)[]
