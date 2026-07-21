# Function: improvedLayout()

> **improvedLayout**(`model`): [`ImprovedLayout`](../interfaces/ImprovedLayout.md)

Defined in: engine/improved.ts:71

Build the best genuinely-better layout for a cell by repositioning its
existing stations. Always returns a result: when nothing beats the current
layout, `better` is false and `strategy` is "none" so the UI can say "already
well laid out" honestly rather than inventing a change.

## Parameters

### model

[`Model`](../../../model/types/interfaces/Model.md)

## Returns

[`ImprovedLayout`](../interfaces/ImprovedLayout.md)
