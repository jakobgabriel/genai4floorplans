# Function: qualityConfidence()

> **qualityConfidence**(`q`): [`Confidence`](../type-aliases/Confidence.md)

Defined in: model/types.ts:350

The confidence a per-field data quality propagates as, so a derived number
 (TCO, station-count, throughput) can take the weakest of its inputs (§5).
 measured → high, benchmarked → med, estimated → low.

## Parameters

### q

[`DataQuality`](../type-aliases/DataQuality.md)

## Returns

[`Confidence`](../type-aliases/Confidence.md)
