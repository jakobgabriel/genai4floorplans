# Function: isFlowFunction()

> **isFlowFunction**(`s`): `boolean`

Defined in: model/types.ts:452

Types that hold material rather than process it — a buffer or a store. A flow
 function is part of the material flow (it sits in the graph, holds WIP, takes
 floor space) but is NOT a work step: it contributes no cycle time, takt,
 balance or operator load. `store` covers the input/output staging areas too.

## Parameters

### s

`Pick`\<[`Station`](../interfaces/Station.md), `"type"`\>

## Returns

`boolean`
