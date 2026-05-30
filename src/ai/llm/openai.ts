import type { Creds } from "../../store/settings";
import type { AiImage, AiProvider } from "../types";
import { SYSTEM, makeLlmProvider, type FetchLike, type LlmTransport } from "./core";

// OpenAI (Chat Completions API) adapter — a thin transport over the shared LLM
// core, mirroring the Claude adapter. Dormant until a key is set in Settings.
// Runs client-side directly against the OpenAI API. All behaviour (prompts,
// parsing, engine re-scoring) lives in core.ts, so output is treated identically
// to any other provider: re-validated and re-scored by the engine.

const API_URL = "https://api.openai.com/v1/chat/completions";

interface ChatChoice {
  message?: { content?: string };
}
interface ChatResponse {
  choices?: ChatChoice[];
}

export function createOpenAiProvider(creds: Creds, fetchImpl: FetchLike = fetch): AiProvider {
  const transport: LlmTransport = {
    imageContent(image: AiImage) {
      return { type: "image_url", image_url: { url: `data:${image.mediaType};base64,${image.data}` } };
    },
    async callContent(content: unknown): Promise<string> {
      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: "Bearer " + creds.apiKey,
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: 4096,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content },
          ],
        }),
      });
      if (!res.ok) throw new Error("OpenAI API error " + res.status + ": " + (await res.text()).slice(0, 200));
      const data = (await res.json()) as ChatResponse;
      return (data.choices?.[0]?.message?.content ?? "").trim();
    },
  };
  return makeLlmProvider("OpenAI (" + creds.model + ")", transport);
}
