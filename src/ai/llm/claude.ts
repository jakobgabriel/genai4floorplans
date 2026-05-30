import type { Model } from "../../model/types";
import type { Settings } from "../../store/settings";
import { parseModelText } from "../../io/json";
import { buildRating } from "../../engine/rating";
import { modelReducer, type ModelAction } from "../../store/reducer";
import type { AiImage, AiProvider, EditResult, GoalResult, GoalSpec, Proposal, ProposalContext } from "../types";
import { dedupeProposals, makeProposal } from "../verify";
import { strategist } from "../strategist";

// Claude API adapter — dormant until a key is set in Settings. It implements the
// same AiProvider interface as the strategist. Crucially, anything it returns is
// re-validated and **re-scored by the engine** (verify.ts / buildRating); the
// model's own numbers are ignored. Runs client-side via the documented
// anthropic-dangerous-direct-browser-access header.

const API_URL = "https://api.anthropic.com/v1/messages";

interface MessageContentBlock {
  type: string;
  text?: string;
}
interface MessageResponse {
  content?: MessageContentBlock[];
}

/** Allow injecting a fetch implementation for tests. */
export type FetchLike = typeof fetch;

const SYSTEM = `You are FlowPlan's layout strategist for a single manufacturing cell.
You receive a JSON "model" (stations on a grid, with flows between them) and must
respond ONLY with JSON — no prose, no code fences. Stations have x,y,w,h on a
gridW×gridH grid; "fixed" stations must not move; never overlap stations or
noGoZones. You never invent KPI numbers; the host app scores your output.`;

async function callClaudeContent(settings: Settings, content: unknown, fetchImpl: FetchLike): Promise<string> {
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: settings.model,
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error("Claude API error " + res.status + ": " + (await res.text()).slice(0, 200));
  const data = (await res.json()) as MessageResponse;
  const text = (data.content ?? []).map((b) => b.text ?? "").join("");
  return text.trim();
}

function callClaude(settings: Settings, userText: string, fetchImpl: FetchLike): Promise<string> {
  return callClaudeContent(settings, userText, fetchImpl);
}

function extractJSON(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const arr = cleaned.indexOf("[");
    const from = arr >= 0 && (arr < start || start < 0) ? arr : start;
    const end = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (from >= 0 && end > from) return JSON.parse(cleaned.slice(from, end + 1));
    throw new Error("Claude did not return JSON.");
  }
}

export function createClaudeProvider(settings: Settings, fetchImpl: FetchLike = fetch): AiProvider {
  return {
    name: "Claude (" + settings.model + ")",

    async propose(ctx: ProposalContext): Promise<Proposal[]> {
      const prompt = `Here is the current cell model:\n${JSON.stringify(ctx.model)}\n\nPropose up to 4 improved layouts. Respond with JSON: an array of objects {"title": string, "rationale": string, "model": <full model JSON>}. Keep ids, footprints and fixed flags; only reposition movable stations and optionally change flow transport.`;
      const raw = extractJSON(await callClaude(settings, prompt, fetchImpl)) as Array<{
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
      const prompt = `Cell model:\n${JSON.stringify(ctx.model)}\n\nEngine rating (authoritative, do not change the numbers):\n${JSON.stringify(
        { letter: r.letter, composite: r.composite, scores: r.scores, bottleneck: r.balance.bottleneck, flowReductionPct: r.flowReductionPct },
      )}\n\nWrite a concise plain-language paragraph for a review pack explaining the grade, the binding constraint, and the top 1-2 trade-offs. Respond with JSON {"narration": string}.`;
      const out = extractJSON(await callClaude(settings, prompt, fetchImpl)) as { narration?: string };
      return out.narration || "";
    },

    async edit(ctx: ProposalContext, instruction: string): Promise<EditResult> {
      const prompt = `Cell model:\n${JSON.stringify(ctx.model)}\n\nUser instruction: ${JSON.stringify(
        instruction,
      )}\n\nReturn JSON {"summary": string, "actions": ModelAction[]} where ModelAction is one of: {"type":"MOVE_STATION","id","x","y"}, {"type":"ADD_FLOW","from","to"}, {"type":"REMOVE_FLOW","from","to"}, {"type":"UPDATE_STATION","id","patch":{}}, {"type":"APPLY_TEMPLATE","form":"I|U|L|S"}, {"type":"DELETE_STATION","id"}. Use existing station ids.`;
      const out = extractJSON(await callClaude(settings, prompt, fetchImpl)) as { summary?: string; actions?: ModelAction[] };
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
      const prompt = `Convert this routing sheet / description into a FlowPlan model. Respond with JSON for the model only (fields: name, gridW, gridH, stations[], flows[]). Routing:\n${text}`;
      const parsed = parseModelText(JSON.stringify(extractJSON(await callClaude(settings, prompt, fetchImpl))));
      if (!parsed.ok || !parsed.model) throw new Error(parsed.error || "Could not parse AI model.");
      return parsed.model;
    },

    async design(brief: string): Promise<Model> {
      const prompt = `Design a single manufacturing cell from this brief. Respond with model JSON only (name, gridW, gridH, stations[] with id/name/role(input|process|output)/type/cycleTimeSec/operators/parallelUnits, flows[] with from/to/volume). Brief:\n${brief}`;
      const parsed = parseModelText(JSON.stringify(extractJSON(await callClaude(settings, prompt, fetchImpl))));
      if (!parsed.ok || !parsed.model) throw new Error(parsed.error || "Could not parse AI model.");
      return parsed.model;
    },

    async ingestImage(image: AiImage): Promise<Model> {
      const content = [
        { type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } },
        { type: "text", text: "This is a routing sheet or a hand-drawn cell layout. Extract a FlowPlan model. Respond with model JSON only (name, gridW, gridH, stations[], flows[])." },
      ];
      const text = await callClaudeContent(settings, content, fetchImpl);
      const parsed = parseModelText(JSON.stringify(extractJSON(text)));
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
