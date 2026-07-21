# Function: fieldQuality()

> **fieldQuality**(`s`, `field`): [`DataQuality`](../type-aliases/DataQuality.md)

Defined in: model/types.ts:356

Data quality of a station field, defaulting to "estimated" when unmarked —
 an unmarked number is suspect, not firm (spec §5).

## Parameters

### s

[`Station`](../interfaces/Station.md)

### field

[`StationDataField`](../type-aliases/StationDataField.md)

## Returns

[`DataQuality`](../type-aliases/DataQuality.md)
