import { resolveCreds, type Settings } from "@flowplan/core/ai/creds";
import type { AiProvider } from "@flowplan/core/ai/types";
import { strategist } from "@flowplan/core/ai/strategist";
import { withFallback } from "@flowplan/core/ai/fallback";
import { createClaudeProvider } from "@flowplan/core/ai/llm/claude";
import { createOpenAiProvider } from "@flowplan/core/ai/llm/openai";

// Selects the active provider. A cloud provider (Claude or OpenAI) is used only
// when configured with a key; any adapter failure falls back to the deterministic
// strategist so AI Chat always works offline.
//
// NOTE: this client-side selector keeps the legacy direct-browser-access path for
// offline / BYO-key use. When signed into a team, the app instead uses the remote
// provider (see ai/remote.ts) so keys never reach the browser.
export function getProvider(settings: Settings): AiProvider {
  const creds = resolveCreds(settings);
  if (settings.aiProvider === "claude" && creds.apiKey.trim()) {
    return withFallback(createClaudeProvider(creds), strategist);
  }
  if (settings.aiProvider === "openai" && creds.apiKey.trim()) {
    return withFallback(createOpenAiProvider(creds), strategist);
  }
  return strategist;
}
