# Function: operatorPaceLanes()

> **operatorPaceLanes**(`s`): `number`

Defined in: engine/balance.ts:66

Parallel lanes an operator count contributes to *throughput*.

 Audit A-02: operators must NOT multiply a machine's throughput — a machine's
 rate is set by its cycle time, and identical parallel machines are modelled
 explicitly via `parallelUnits`. Adding a second operator to one CNC does not
 double its output; adding a second person to a manual bench (each assembling
 a separate part) genuinely does. So operators scale throughput only for
 operator-paced work (`manual`), where each operator is a parallel worker.
 Machine/quality/store stations are machine- or process-paced: operators there
 drive labour cost and manning, not part throughput.

## Parameters

### s

`Pick`\<[`Station`](../../../model/types/interfaces/Station.md), `"type"` \| `"operators"`\>

## Returns

`number`
