# Function: stationConfidence()

> **stationConfidence**(`s`, `fields?`): [`Confidence`](../type-aliases/Confidence.md)

Defined in: model/types.ts:362

Confidence a station propagates, taken as the weakest across its marked
 numeric fields (§5). Used when a derived figure is built from the station.

## Parameters

### s

[`Station`](../interfaces/Station.md)

### fields?

[`StationDataField`](../type-aliases/StationDataField.md)[] = `STATION_DATA_FIELDS`

## Returns

[`Confidence`](../type-aliases/Confidence.md)
