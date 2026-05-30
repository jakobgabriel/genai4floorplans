import type { AiProviderId } from "@prisma/client";
import type { AiProvider } from "@flowplan/core/ai/types";
import { strategist } from "@flowplan/core/ai/strategist";
import { withFallback } from "@flowplan/core/ai/fallback";
import { createClaudeProvider } from "@flowplan/core/ai/llm/claude";
import { createOpenAiProvider } from "@flowplan/core/ai/llm/openai";
import { getPrisma } from "../lib/prisma.ts";
import { decryptSecret } from "../lib/crypto.ts";
import { ENV } from "../lib/env.ts";

// Build the AI provider for a team: prefer the team's stored (encrypted)
// credential, else an env-level key, else the offline strategist. Cloud providers
// are always wrapped so failures fall back to the deterministic strategist.
export async function resolveTeamProvider(teamId: string): Promise<{ provider: AiProvider; provider_id: AiProviderId | null; model: string }> {
  const creds = await getPrisma().teamAiCredential.findMany({
    where: { teamId },
    select: { provider: true, model: true, keyCiphertext: true, keyIv: true, keyTag: true },
  });

  // Prefer Claude, then OpenAI, when a team credential exists.
  const claude = creds.find((c) => c.provider === "CLAUDE");
  const openai = creds.find((c) => c.provider === "OPENAI");

  if (claude) {
    const apiKey = decryptSecret({ ciphertext: claude.keyCiphertext, iv: claude.keyIv, tag: claude.keyTag });
    return { provider: withFallback(createClaudeProvider({ apiKey, model: claude.model }), strategist), provider_id: "CLAUDE", model: claude.model };
  }
  if (openai) {
    const apiKey = decryptSecret({ ciphertext: openai.keyCiphertext, iv: openai.keyIv, tag: openai.keyTag });
    return { provider: withFallback(createOpenAiProvider({ apiKey, model: openai.model }), strategist), provider_id: "OPENAI", model: openai.model };
  }
  // Env-level fallback keys (single shared key for all teams).
  if (ENV.anthropicKey) {
    return { provider: withFallback(createClaudeProvider({ apiKey: ENV.anthropicKey, model: "claude-sonnet-4-6" }), strategist), provider_id: "CLAUDE", model: "claude-sonnet-4-6" };
  }
  if (ENV.openaiKey) {
    return { provider: withFallback(createOpenAiProvider({ apiKey: ENV.openaiKey, model: "gpt-4o" }), strategist), provider_id: "OPENAI", model: "gpt-4o" };
  }
  return { provider: strategist, provider_id: null, model: "offline" };
}
