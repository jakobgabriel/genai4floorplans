# Interface: InferenceResult

Defined in: engine/infer.ts:226

## Properties

### elements

> **elements**: [`WorkElement`](../../../model/types/interfaces/WorkElement.md)[]

Defined in: engine/infer.ts:227

***

### matchRatePct

> **matchRatePct**: `number`

Defined in: engine/infer.ts:232

Share of elements whose capability was matched, 0–100.

***

### notes

> **notes**: [`InferenceNote`](InferenceNote.md)[]

Defined in: engine/infer.ts:228

***

### unmatched

> **unmatched**: `string`[]

Defined in: engine/infer.ts:230

Steps where no keyword matched — the planner should name these better.
