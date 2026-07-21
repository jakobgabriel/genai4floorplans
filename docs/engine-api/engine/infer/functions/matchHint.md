# Function: matchHint()

> **matchHint**(`name`): [`CapabilityHint`](../interfaces/CapabilityHint.md) \| `null`

Defined in: engine/infer.ts:169

Best keyword match for a step name, or null when nothing matches.

Earliest match wins, then longest. Step names are written verb-first — "Move
to buffer", "Carry to press" — so position beats specificity: matching on
length alone picks the noun ("buffer", "press") and mis-classifies the step.

## Parameters

### name

`string`

## Returns

[`CapabilityHint`](../interfaces/CapabilityHint.md) \| `null`
