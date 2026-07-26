import { costAnalysis } from "@flowplan/core/engine/cost";
import { yieldAnalysis } from "@flowplan/core/engine/yield";
import { autoPotential } from "@flowplan/core/engine/automation";
import type { FlowPlanApi } from "../store/useFlowPlan";

/**
 * The analysis path.
 *
 * One assessment read top to bottom rather than five sibling tabs the reader has
 * to sequence themselves: how good is it → why → what caps the output → what is
 * lost → what could run itself → what it costs. The same six stages drive the
 * Analysis page's sections, its jump-nav, and the at-a-glance grid on Summary,
 * so the order a plan is read in is the same everywhere.
 */
export type AnalysisStepId = "verdict" | "flow" | "balance" | "yield" | "automation" | "cost";

export interface AnalysisStepMeta {
  id: AnalysisStepId;
  /** Jump-nav chip and summary-tile heading. */
  label: string;
  /** Section heading on the Analysis page. */
  title: string;
  /** The question this stage answers — only where the title does not already
   *  say it. "What caps the output?" under "Balance & bottleneck" is the title
   *  again; "Where does the material cost come from?" under "Flow & layout" is
   *  not, because the title does not mention cost. */
  question?: string;
}

export const ANALYSIS_PATH: AnalysisStepMeta[] = [
  { id: "verdict", label: "Verdict", title: "Verdict", question: "The grade, and what would move it." },
  { id: "flow", label: "Flow", title: "Flow & layout", question: "Where the material cost comes from." },
  { id: "balance", label: "Balance", title: "Balance & bottleneck" },
  { id: "yield", label: "Yield", title: "Yield" },
  { id: "automation", label: "Automation", title: "Automation" },
  { id: "cost", label: "Cost", title: "Cost" },
];

/** Carbon Tag palette only — no bespoke thresholds colours. */
export type Tone = "green" | "blue" | "red" | "gray";

export interface AnalysisReading extends AnalysisStepMeta {
  value: string;
  sub: string;
  tone: Tone;
}

const band = (score: number): Tone => (score >= 80 ? "green" : score >= 60 ? "blue" : "red");

/**
 * The headline figure for each stage, derived from the *current* model — the
 * same engines the sections themselves render, read once for the overview.
 */
export function analysisPath(api: FlowPlanApi): AnalysisReading[] {
  const r = api.rating;
  const bal = r.balance;
  const y = yieldAnalysis(api.model.stations, api.model.flows);
  const c = costAnalysis(api.model);
  const chain = api.chain;
  const process = api.model.stations.filter((s) => s.role === "process");
  const worth = process.filter((s) => s.auto !== "auto" && autoPotential(s).pct >= 70).length;
  const biggest = r.pareto[0];

  const by: Record<AnalysisStepId, { value: string; sub: string; tone: Tone }> = {
    verdict: {
      value: `${r.composite.toFixed(0)}/100`,
      sub: `Grade ${r.letter}`,
      tone: band(r.composite),
    },
    flow: {
      // The engine's sub-scores are unrounded floats; shown raw one of them ran
      // to fifteen decimals and overflowed the tile.
      value: `${r.scores.placement.toFixed(0)}/100`,
      sub: biggest ? `${biggest.from} → ${biggest.to} is ${biggest.share.toFixed(0)}% of it` : "no material flows drawn yet",
      tone: band(r.scores.placement),
    },
    balance: {
      value: `${bal.lineOut.toLocaleString()}/sh`,
      sub: bal.bottleneck ? `capped by ${bal.bottleneck.name}` : `takt ≈ ${bal.takt}s`,
      tone: band(bal.score),
    },
    yield: {
      value: `${y.rolledYield}%`,
      sub: y.totalScrap > 0 ? `${y.totalScrap.toLocaleString()} scrap/shift` : "no scrap rates entered",
      tone: y.totalScrap > 0 ? band(y.rolledYield) : "gray",
    },
    automation: {
      value: `${r.scores.auto.toFixed(0)}/100`,
      sub:
        chain.islands > 0
          ? `${chain.islands} auto-island${chain.islands > 1 ? "s" : ""} to chain`
          : worth > 0
            ? `${worth} step${worth > 1 ? "s" : ""} worth automating`
            : "chains are intact",
      tone: chain.islands > 0 ? "red" : band(r.scores.auto),
    },
    cost: {
      // Both fraction digits pinned: money with one decimal ("$3.2") reads as a
      // rounded-off number rather than a price.
      value: `${c.currency}${c.costPerPart.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sub: `per part · ${c.currency}${c.capexTotal.toLocaleString()} capex`,
      // Cost has no target to score against, so it stays neutral rather than
      // inventing a threshold.
      tone: "gray",
    },
  };

  return ANALYSIS_PATH.map((m) => ({ ...m, ...by[m.id] }));
}
