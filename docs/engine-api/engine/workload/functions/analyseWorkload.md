# Function: analyseWorkload()

> **analyseWorkload**(`elements`, `variantModes`, `taktSec?`, `lossFactor?`): [`WorkloadAnalysis`](../interfaces/WorkloadAnalysis.md)

Defined in: engine/workload.ts:126

Analyse a workload across its mix.

`taktSec` is optional; without it the station counts are null but every time
figure is still produced.

## Parameters

### elements

[`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]

### variantModes

[`VariantMode`](../../../model/types/interfaces/VariantMode.md)[] \| `undefined`

### taktSec?

`number`

### lossFactor?

`number` = `DEFAULT_LOSS_FACTOR`

## Returns

[`WorkloadAnalysis`](../interfaces/WorkloadAnalysis.md)
