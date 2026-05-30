// Shared LLM-provider core. Every cloud adapter (Claude, OpenAI, …) has identical
// behaviour — same prompts, same JSON parsing, and crucially the same engine
// re-scoring (verify.ts / buildRating); only the HTTP transport differs. So each
// adapter supplies just a `callContent(content)` transport and this builds the
// full AiProvider. Anything the model returns is re-validated and re-scored; the
// model's own numbers are always ignored.

import type { Model } from "../../model/types";
import { parseModelText } from "../../io/json";
import { buildRating } from "../../engine/rating";
import { modelReducer, type ModelAction } from "../../store/reducer";
import type { AiImage, AiProvider, EditResult, GoalResult, GoalSpec, Proposal, ProposalContext } from "../types";
import { dedupeProposals, makeProposal } from "../verify";
import { strategist } from "../strategist";
import { SYSTEM, VISION_TEXT, designPrompt, editPrompt, extractJSON, ingestPrompt, narratePrompt, proposePrompt } from "../prompts";

/** Allow injecting a fetch implementation for tests. */
export type FetchLike = typeof fetch;

export { SYSTEM };

/** A provider's transport: send user content (text or a multimodal array) and get text back. */
export interface LlmTransport {
  /** Provider-specific multimodal image block (Claude vs OpenAI differ). */
  imageContent(image: AiImage): unknown;
  /** POST the content and return the model's text reply (already trimmed). */
  callContent(content: unknown): Promise<string>;
}

export function makeLlmProvider(name: string, t: LlmTransport): AiProvider {
  const callText = (text: string) => t.callContent(text);

  return {
    name,

    async propose(ctx: ProposalContext): Promise<Proposal[]> {
      const raw = extractJSON(await callText(proposePrompt(ctx.model))) as Array<{
        title?: string;
        rationale?: string;
        model?: unknown;
      }>;
      const list = Array.isArray(raw) ? raw : [];
      const proposals: Proposal[] = [];
      for (const item of list) {
        const parsed = parseModelText(JSON.stringify(item.model));
        if (!parsed.ok || !parsed.model) continue;
        const p = makeProposal(ctx.rating, ctx.model, {
          strategy: "llm",
          title: item.title || "AI proposal",
          rationale: item.rationale || "",
          model: parsed.model,
          source: "llm",
        });
        if (p) proposals.push(p);
      }
      return dedupeProposals(proposals, ctx.model).sort((a, b) => b.deltas.composite - a.deltas.composite);
    },

    async narrate(ctx: ProposalContext): Promise<string> {
      // Hand the engine-computed rating to the model so it narrates real numbers.
      const r = buildRating(ctx.model);
      const summary = {
        letter: r.letter,
        composite: r.composite,
        scores: r.scores,
        bottleneck: r.balance.bottleneck,
        flowReductionPct: r.flowReductionPct,
      };
      const out = extractJSON(await callText(narratePrompt(ctx.model, summary))) as { narration?: string };
      return out.narration || "";
    },

    async edit(ctx: ProposalContext, instruction: string): Promise<EditResult> {
      const out = extractJSON(await callText(editPrompt(ctx.model, instruction))) as {
        summary?: string;
        actions?: ModelAction[];
      };
      const actions = Array.isArray(out.actions) ? out.actions : [];
      // Validate every action applies cleanly against a working copy.
      let working = ctx.model;
      const safe: ModelAction[] = [];
      for (const a of actions) {
        const next = modelReducer(working, a);
        if (next !== working) {
          safe.push(a);
          working = next;
        }
      }
      return {
        actions: safe,
        summary: out.summary || (safe.length ? "Applied AI edit." : ""),
        unresolved: safe.length === 0 ? "The AI returned no applicable actions." : undefined,
      };
    },

    async ingest(text: string): Promise<Model> {
      const parsed = parseModelText(JSON.stringify(extractJSON(await callText(ingestPrompt(text)))));
      if (!parsed.ok || !parsed.model) throw new Error(parsed.error || "Could not parse AI model.");
      return parsed.model;
    },

    async design(brief: string): Promise<Model> {
      const parsed = parseModelText(JSON.stringify(extractJSON(await callText(designPrompt(brief)))));
      if (!parsed.ok || !parsed.model) throw new Error(parsed.error || "Could not parse AI model.");
      return parsed.model;
    },

    async ingestImage(image: AiImage): Promise<Model> {
      const content = [t.imageContent(image), { type: "text", text: VISION_TEXT }];
      const parsed = parseModelText(JSON.stringify(extractJSON(await t.callContent(content))));
      if (!parsed.ok || !parsed.model) throw new Error(parsed.error || "Could not parse AI model from the image.");
      return parsed.model;
    },

    // Goal-seeking is a deterministic search — delegate to the strategist so the
    // result is reproducible and always engine-verified.
    optimizeGoal(ctx: ProposalContext, goal: GoalSpec): Promise<GoalResult> {
      return strategist.optimizeGoal(ctx, goal);
    },
  };
}
