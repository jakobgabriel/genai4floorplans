# Function: inferWorkload()

> **inferWorkload**(`steps`): [`InferenceResult`](../interfaces/InferenceResult.md)

Defined in: engine/infer.ts:243

Turn a minimal step list into a full WorkElement set.

Precedence defaults to a linear chain: it is the only safe assumption without
product data, it is correct for most cells, and it is trivially editable
afterwards. The alternative — demanding a DAG up front — is the single
biggest adoption risk in the spec (§11.2).

## Parameters

### steps

[`RawStep`](../interfaces/RawStep.md)[]

## Returns

[`InferenceResult`](../interfaces/InferenceResult.md)
