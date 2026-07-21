# Function: buildWorkloadStations()

> **buildWorkloadStations**(`steps`, `perShiftTarget`, `shiftHours`, `variantModes?`, `opts?`): [`WorkloadPipelineResult`](../interfaces/WorkloadPipelineResult.md)

Defined in: engine/generateCell.ts:178

Names → inferred elements → balanced stations. The whole input burden is the
`steps` array; `perShiftTarget` and `shiftHours` set the takt.

## Parameters

### steps

[`RawStep`](../../infer/interfaces/RawStep.md)[]

### perShiftTarget

`number`

### shiftHours

`number`

### variantModes?

[`VariantMode`](../../../model/types/interfaces/VariantMode.md)[]

### opts?

[`StationBuildOptions`](../interfaces/StationBuildOptions.md) = `{}`

## Returns

[`WorkloadPipelineResult`](../interfaces/WorkloadPipelineResult.md)
