# Function: conceptFit()

> **conceptFit**(`kind`, `annualVolume`): `number`

Defined in: engine/concepts.ts:148

How well a concept suits an annual volume, 0–100.

Scores 100 in the middle of the band and tapers to 0 one band-width outside
it, so a concept just past its range is penalised rather than excluded —
planners need to see the near-misses to understand the crossover.

## Parameters

### kind

[`ConceptKind`](../type-aliases/ConceptKind.md)

### annualVolume

`number`

## Returns

`number`
