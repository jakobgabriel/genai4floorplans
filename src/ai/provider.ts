import type { Model } from "../model/types";
import { resolveCreds, type Settings } from "../store/settings";
import type { AiImage, AiProvider, EditResult, GoalResult, GoalSpec, Proposal, ProposalContext } from "./types";
import { strategist } from "./strategist";
import { createClaudeProvider } from "./llm/claude";
import { createOpenAiProvider } from "./llm/openai";

// Selects the active provider. A cloud provider (Claude or OpenAI) is used only
// when configured with a key; any adapter failure falls back to the deterministic
// strategist so AI Chat always works offline.
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
    async design(brief: string): Promise<Model> {
      try {
        return await primary.design(brief);
      } catch {
        return backup.design(brief);
      }
    },
    // Vision is LLM-only: don't silently fall back to a strategist that can't see.
    ingestImage(image: AiImage): Promise<Model> {
      return primary.ingestImage(image);
    },
    async optimizeGoal(ctx: ProposalContext, goal: GoalSpec): Promise<GoalResult> {
      try {
        return await primary.optimizeGoal(ctx, goal);
      } catch {
        return backup.optimizeGoal(ctx, goal);
      }
    },
  };
}
