# Function: governingDemandUnits()

> **governingDemandUnits**(`model`): `number`

Defined in: engine/takt.ts:7

The governing demand for takt: the peak year drives the tightest takt, so a
 cell sized to it meets every year in the horizon. Returns 0 when no demand
 is modelled.

## Parameters

### model

`Pick`\<[`Model`](../../../model/types/interfaces/Model.md), `"demand"`\>

## Returns

`number`
