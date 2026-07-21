# Function: balanceWorkloadIntoCell()

> **balanceWorkloadIntoCell**(`model`, `opts?`): [`WorkloadCellResult`](../interfaces/WorkloadCellResult.md)

Defined in: engine/generateCell.ts:235

Close the spec's `workload → balancer → stations` loop from the editor
(audit B-02): take the model's authored work elements, balance them into
stations with the customer takt, place them on an I-form, wire a sequential
flow through any existing input/output docks, and return a NEW model. The
caller applies it explicitly (a confirmed, undoable action), never silently.

Everything else on the model — demand, cost config, weights, workload,
variant modes, groups, grid — is preserved. Only stations and flows change.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

### opts?

#### oneStationPerStep?

`boolean`

## Returns

[`WorkloadCellResult`](../interfaces/WorkloadCellResult.md)
