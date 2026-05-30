import type { Model } from "../model/types";
import type { AiImage, AiProvider, EditResult, GoalResult, GoalSpec, Proposal, ProposalContext } from "./types";

// Wrap a primary provider so any failure (or empty proposal list) falls back to a
// backup — in practice the deterministic offline strategist, so AI features always
// work. Shared by the client selector and the server-side proxy.
export function withFallback(primary: AiProvider, backup: AiProvider): AiProvider {
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
