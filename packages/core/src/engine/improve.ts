import type { Confidence, Model, Station } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import { balanceAnalysis } from "./balance";
import { effectiveCycleSec, cycleAnalysis } from "./cycle";
import { computeKPIs } from "./kpis";
import { optimize } from "./optimize";
import { cellTopology, type CellForm } from "./topology";

// Improvement opportunities (spec §6 C3: "NVA-reduction suggestions ranked by
// impact").
//
// Why this module exists: the original "improvement potential" measured one
// thing only — how much flow cost a pairwise position swap could recover. That
// is a fair question for a hand-drawn layout, but a GENERATED cell is already
// placed in flow order along its topology path, so no swap can help and the
// number is always 0%. Reporting 0% there is honest and useless: it says "this
// layout cannot be improved" when what it means is "this particular optimiser
// has nothing left to do".
//
// A cell has several independent axes of headroom. This ranks all of them:
//
//   rebalance    idle time against takt — stations that could be merged
//   bottleneck   the constraint, and what lifting it is worth
//   waste        NVA content, weighted by whether it sits on the constraint
//   relayout     the position-swap gain (the original metric, kept)
//   form         whether another topology shortens the flow

export type ImprovementKind = "rebalance" | "bottleneck" | "waste" | "relayout" | "form";

export interface Improvement {
  kind: ImprovementKind;
  title: string;
  detail: string;
  /** Extra parts/shift if taken. 0 when the gain is cost, not throughput. */
  throughputGain: number;
  /** Stations that could be removed. */
  stationsSaved: number;
  /** Cycle seconds recoverable. */
  secondsSaved: number;
  /** 0–100, for ranking. Throughput beats labour beats distance. */
  impact: number;
  confidence: Confidence;
  /** Station ids the suggestion applies to. */
  targetIds: string[];
}

export interface ImprovementReport {
  improvements: Improvement[];
  /** True when nothing was found — and then `why` says what was checked. */
  exhausted: boolean;
  why: string;
  /** Current line output, for context. */
  lineOut: number;
  taktSec: number;
  balanceLossPct: number;
}

const ALL_FORMS: CellForm[] = ["I", "U", "L", "S", "W", "O"];

/**
 * Rank what could still be improved about a cell.
 *
 * Works on any model — generated or hand-drawn — because everything is derived
 * from the stations themselves rather than from a retained solver result.
 */
export function findImprovements(model: Model, opts: { restarts?: number } = {}): ImprovementReport {
  const shiftHours = model.shiftHours ?? DEFAULT_SHIFT_HOURS;
  const procs = model.stations.filter((s) => s.role === "process");
  const bal = balanceAnalysis(model.stations, model.flows, shiftHours);
  const out: Improvement[] = [];

  const empty: ImprovementReport = {
    improvements: [],
    exhausted: true,
    why: "No process steps to improve.",
    lineOut: bal.lineOut,
    taktSec: bal.takt,
    balanceLossPct: 0,
  };
  if (procs.length === 0) return empty;

  const cycles = procs.map((s) => effectiveCycleSec(s));
  const totalCycle = cycles.reduce((a, c) => a + c, 0);
  const maxCycle = Math.max(...cycles);
  const idle = procs.reduce((a, s) => a + Math.max(0, maxCycle - effectiveCycleSec(s)), 0);
  const balanceLossPct = maxCycle > 0 ? +((idle / (maxCycle * procs.length)) * 100).toFixed(1) : 0;

  // ---- 1. rebalance: are there more stations than the work needs? ---------
  const minStations = maxCycle > 0 ? Math.ceil(totalCycle / maxCycle) : procs.length;
  if (procs.length > minStations) {
    const saved = procs.length - minStations;
    const idlest = procs
      .map((s) => ({ s, c: effectiveCycleSec(s) }))
      .sort((a, b) => a.c - b.c)
      .slice(0, saved + 1);
    out.push({
      kind: "rebalance",
      title: `Merge ${saved} station${saved === 1 ? "" : "s"}`,
      detail:
        `${totalCycle.toFixed(0)}s of work across ${procs.length} stations fits in ${minStations} at the current ` +
        `${maxCycle.toFixed(0)}s pace. ${idlest.map((x) => x.s.name).join(", ")} are the least loaded.`,
      throughputGain: 0,
      stationsSaved: saved,
      secondsSaved: 0,
      impact: Math.min(100, 40 + saved * 20),
      confidence: "med",
      targetIds: idlest.map((x) => x.s.id),
    });
  }

  // ---- 2. bottleneck: what is lifting the constraint worth? ---------------
  if (bal.bottleneck) {
    const bn = procs.find((s) => s.id === bal.bottleneck?.id);
    const others = bal.steps.filter((s) => s.id !== bal.bottleneck?.id && s.rate > 0).sort((a, b) => a.rate - b.rate);
    const next = others[0];
    if (bn && next && next.rate > bal.lineOut) {
      const gain = Math.round(next.rate - bal.lineOut);
      out.push({
        kind: "bottleneck",
        title: `Lift ${bn.name} — worth ${gain.toLocaleString("en-US")} parts/shift`,
        detail:
          `${bn.name} caps the line at ${bal.lineOut.toLocaleString("en-US")}/shift. The next constraint is ` +
          `${next.name} at ${next.rate.toLocaleString("en-US")}/shift, so that is the ceiling this move buys.`,
        throughputGain: gain,
        stationsSaved: 0,
        secondsSaved: +Math.max(0, effectiveCycleSec(bn) - (next.cycle || 0)).toFixed(1),
        // Throughput is the highest-value axis, so it dominates the ranking.
        impact: Math.min(100, 60 + Math.round((gain / Math.max(1, bal.lineOut)) * 100)),
        confidence: "med",
        targetIds: [bn.id],
      });
    }
  }

  // ---- 3. waste: NVA content, weighted by whether it is on the constraint --
  const cyc = cycleAnalysis(procs, bal.takt);
  cyc.waste.slice(0, 4).forEach((w) => {
    const onBottleneck = w.stationId === bal.bottleneck?.id;
    out.push({
      kind: "waste",
      title: `Remove ${w.label.toLowerCase()} at ${w.stationName} — ${w.sec}s`,
      detail: onBottleneck
        ? `${w.sec}s of ${w.label.toLowerCase()} sits on the bottleneck, so removing it raises line output directly.`
        : `${w.sec}s of ${w.label.toLowerCase()} (${w.sharePct}% of all waste). Off the constraint, so this buys labour, not throughput.`,
      throughputGain: onBottleneck && bal.takt > 0 ? Math.round((w.sec / bal.takt) * bal.lineOut) : 0,
      stationsSaved: 0,
      secondsSaved: w.sec,
      // Waste on the constraint is worth far more than waste beside it.
      impact: onBottleneck ? Math.min(100, 55 + w.sharePct) : Math.min(50, 10 + w.sharePct),
      confidence: "low",
      targetIds: [w.stationId],
    });
  });

  // ---- 4. relayout: the original position-swap gain ------------------------
  const grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };
  const actual = computeKPIs(model.stations, model.flows, grid);
  const opt = computeKPIs(optimize(model.stations, model.flows, grid, { restarts: opts.restarts ?? 4 }), model.flows, grid);
  const flowPct = actual.flowCost > 0 ? ((actual.flowCost - opt.flowCost) / actual.flowCost) * 100 : 0;
  if (flowPct > 1) {
    out.push({
      kind: "relayout",
      title: `Reposition stations — ${flowPct.toFixed(0)}% less material travel`,
      detail: "Swapping station positions shortens the flow. Does not change work content or station count.",
      throughputGain: 0,
      stationsSaved: 0,
      secondsSaved: 0,
      impact: Math.min(45, Math.round(flowPct)),
      confidence: "high",
      targetIds: [],
    });
  }

  // ---- 5. form: would another topology shorten the flow? ------------------
  const best = bestForm(model, procs, grid);
  if (best && best.gainPct > 2) {
    out.push({
      kind: "form",
      title: `Try a ${best.form}-form layout — ${best.gainPct.toFixed(0)}% less travel`,
      detail: `Re-laying the same stations on a ${best.form} path shortens the material route.`,
      throughputGain: 0,
      stationsSaved: 0,
      secondsSaved: 0,
      impact: Math.min(40, Math.round(best.gainPct)),
      confidence: "med",
      targetIds: [],
    });
  }

  out.sort((a, b) => b.impact - a.impact);

  return {
    improvements: out,
    exhausted: out.length === 0,
    why:
      out.length > 0
        ? `${out.length} opportunity/ies across balance, constraint, waste and layout.`
        : "Checked balance, bottleneck, waste, station positions and all four cell forms — none showed headroom. " +
          "The remaining levers are process change (shorter cycles) or automation, which the layout cannot reach.",
    lineOut: bal.lineOut,
    taktSec: bal.takt,
    balanceLossPct,
  };
}

/** The cell form with the lowest flow cost for these stations, if better. */
function bestForm(
  model: Model,
  procs: Station[],
  grid: { gridW: number; gridH: number; noGoZones: Model["noGoZones"] },
): { form: CellForm; gainPct: number } | null {
  if (procs.length < 3) return null;
  const current = computeKPIs(model.stations, model.flows, grid).flowCost;
  if (!(current > 0)) return null;

  let best: { form: CellForm; gainPct: number } | null = null;
  ALL_FORMS.forEach((form) => {
    const layout = cellTopology(form, procs.length, { gridW: model.gridW, gridH: model.gridH });
    const moved = model.stations.map((s) => {
      const i = procs.findIndex((p) => p.id === s.id);
      const slot = i >= 0 ? layout.slots[i] : null;
      return slot ? { ...s, x: slot.x, y: slot.y } : s;
    });
    const cost = computeKPIs(moved, model.flows, grid).flowCost;
    const gainPct = ((current - cost) / current) * 100;
    if (gainPct > (best?.gainPct ?? 0)) best = { form, gainPct };
  });
  return best;
}
