import type { Creds } from "../creds";
import type { AiImage, AiProvider } from "../types";
import { SYSTEM, makeLlmProvider, type FetchLike, type LlmTransport } from "./core";

// Claude (Anthropic Messages API) adapter — a thin transport over the shared LLM
// core. Dormant until a key is set in Settings. Runs client-side via the
// documented anthropic-dangerous-direct-browser-access header. All behaviour
// (prompts, parsing, engine re-scoring) lives in core.ts.

export type { FetchLike };

const API_URL = "https://api.anthropic.com/v1/messages";

interface MessageContentBlock {
  type: string;
  text?: string;
}
interface MessageResponse {
  content?: MessageContentBlock[];
}

export function createClaudeProvider(creds: Creds, fetchImpl: FetchLike = fetch): AiProvider {
  const transport: LlmTransport = {
    imageContent(image: AiImage) {
      return { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } };
    },
    async callContent(content: unknown): Promise<string> {
      const res = await fetchImpl(API_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": creds.apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: creds.model,
          max_tokens: 4096,
          system: SYSTEM,
          messages: [{ role: "user", content }],
        }),
      });
      if (!res.ok) throw new Error("Claude API error " + res.status + ": " + (await res.text()).slice(0, 200));
      const data = (await res.json()) as MessageResponse;
      return (data.content ?? []).map((b) => b.text ?? "").join("").trim();
    },
  };
  return makeLlmProvider("Claude (" + creds.model + ")", transport);
}
