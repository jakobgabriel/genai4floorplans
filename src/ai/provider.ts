import type { Settings } from "../store/settings";
import type { AiProvider, EditResult, Proposal, ProposalContext } from "./types";
import { strategist } from "./strategist";
import { createClaudeProvider } from "./llm/claude";

// Selects the active provider. Claude is used only when configured with a key;
// any adapter failure falls back to the deterministic strategist so the Copilot
// always works offline.
export function getProvider(settings: Settings): AiProvider {
  if (settings.aiProvider === "claude" && settings.apiKey.trim()) {
    const claude = createClaudeProvider(settings);
    return withFallback(claude, strategist);
  }
  return strategist;
}

function withFallback(primary: AiProvider, backup: AiProvider): AiProvider {
  return {
    name: primary.name + " (falls back to " + backup.name + ")",
    async propose(ctx: ProposalContext): Promise<Proposal[]> {
      try {
        const r = await primary.propose(ctx);
        return r.length ? r : backup.propose(ctx);
      } catch {
        return backup.propose(ctx);
      }
    },
    async narrate(ctx: ProposalContext): Promise<string> {
      try {
        return await primary.narrate(ctx);
      } catch {
        return backup.narrate(ctx);
      }
    },
    async edit(ctx: ProposalContext, instruction: string): Promise<EditResult> {
      try {
        return await primary.edit(ctx, instruction);
      } catch {
        return backup.edit(ctx, instruction);
      }
    },
    async ingest(text: string) {
      try {
        return await primary.ingest(text);
      } catch {
        return backup.ingest(text);
      }
    },
  };
}
