import type { Model } from "../model/types";
import { buildRating, type Rating } from "../engine/rating";
import { validateFlow } from "../engine/validate";
import type { KpiDeltas, Proposal } from "./types";

// The "engine verifies" gate. Every candidate model produced by any provider
// passes through here so the displayed numbers are the engine's, not the AI's.

let pid = 0;

export function scoreDeltas(before: Rating, after: Rating): KpiDeltas {
  return {
    composite: after.composite - before.composite,
    flowCost: after.scores.flowCost - before.scores.flowCost,
    travel: after.scores.travel - before.scores.travel,
    congestion: after.scores.congestion - before.scores.congestion,
    placement: after.scores.placement - before.scores.placement,
    balance: after.scores.balance - before.scores.balance,
    ergo: after.scores.ergo - before.scores.ergo,
    auto: after.scores.auto - before.scores.auto,
  };
}

/** Stable signature of a layout (positions + the fields that affect the rating). */
export function layoutSignature(m: Model): string {
  return m.stations
    .map((s) =>
      [s.id, s.x, s.y, s.w, s.h, s.role, s.auto, s.operators, s.cycleTimeSec, s.fixed, s.parallelUnits ?? 1, s.splitMode ?? "distribute", s.mergeMode ?? "sum"].join(":"),
    )
    .sort()
    .join("|") +
    "#" +
    m.flows.map((f) => [f.from, f.to, f.transport, f.volume, f.share ?? "", f.unitsPerAssembly ?? 1].join(":")).sort().join("|");
}

export interface ProposalDraft {
  strategy: string;
  title: string;
  rationale: string;
  model: Model;
  source?: "heuristic" | "llm";
  confidence?: number;
}

/**
 * Score a candidate against the current rating and wrap it as a Proposal.
 * Returns null when the candidate is invalid (introduces *new* blocking flow
 * errors) — we never surface a broken layout.
 */
export function makeProposal(current: Rating, currentModel: Model, draft: ProposalDraft): Proposal | null {
  const v = validateFlow(draft.model.stations, draft.model.flows);
  const baseErrs = validateFlow(currentModel.stations, currentModel.flows).issues.filter((i) => i.sev === "err").length;
  const newErrs = v.issues.filter((i) => i.sev === "err").length;
  if (newErrs > baseErrs) return null;
  const after = buildRating(draft.model);
  return {
    id: "p" + ++pid,
    strategy: draft.strategy,
    title: draft.title,
    rationale: draft.rationale,
    model: draft.model,
    before: current,
    after,
    deltas: scoreDeltas(current, after),
    source: draft.source ?? "heuristic",
    confidence: draft.confidence,
  };
}

/** Drop no-op proposals (identical to current) and de-duplicate by layout. */
export function dedupeProposals(proposals: Proposal[], currentModel: Model): Proposal[] {
  const currentSig = layoutSignature(currentModel);
  const seen = new Set<string>([currentSig]);
  const out: Proposal[] = [];
  for (const p of proposals) {
    const sig = layoutSignature(p.model);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(p);
  }
  return out;
}
