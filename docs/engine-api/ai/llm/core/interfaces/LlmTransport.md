# Interface: LlmTransport

Defined in: ai/llm/core.ts:23

A provider's transport: send user content (text or a multimodal array) and get text back.

## Methods

### callContent()

> **callContent**(`content`): `Promise`\<`string`\>

Defined in: ai/llm/core.ts:27

POST the content and return the model's text reply (already trimmed).

#### Parameters

##### content

`unknown`

#### Returns

`Promise`\<`string`\>

***

### imageContent()

> **imageContent**(`image`): `unknown`

Defined in: ai/llm/core.ts:25

Provider-specific multimodal image block (Claude vs OpenAI differ).

#### Parameters

##### image

[`AiImage`](../../../types/interfaces/AiImage.md)

#### Returns

`unknown`
