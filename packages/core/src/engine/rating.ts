import type { Model, RatingWeights, Station } from "../model/types";
import { DEFAULT_SHIFT_HOURS } from "../model/types";
import { computeKPIs, placementScore, type FlowDetail, type KPIResult } from "./kpis";
import { type OptimizeOptions } from "./optimize";
import { bestLayout } from "./bestLayout";
import { balanceAnalysis, type BalanceResult } from "./balance";
import { customerTaktSec } from "./takt";
import { autoCoherenceScore, chainRating, ergoScore } from "./automation";

export const WEIGHTS: RatingWeights = {
  flowCost: 0.25,
  travel: 0.15,
  congestion: 0.1,
  placement: 0.1,
  balance: 0.2,
  ergo: 0.1,
  auto: 0.1,
};

/** Normalize weights so they sum to 1 (UI lets users drag them arbitrarily). */
export function normalizeWeights(w: RatingWeights): RatingWeights {
  const sum = w.flowCost + w.travel + w.congestion + w.placement + w.balance + w.ergo + w.auto;
  if (sum <= 0) return { ...WEIGHTS };
  return {
    flowCost: w.flowCost / sum,
    travel: w.travel / sum,
    congestion: w.congestion / sum,
    placement: w.placement / sum,
    balance: w.balance / sum,
    ergo: w.ergo / sum,
    auto: w.auto / sum,
  };
}

export type Letter = "A" | "B" | "C" | "D" | "E";

export interface RatingScores {
  flowCost: number;
  travel: number;
  congestion: number;
  placement: number;
  balance: number;
  ergo: number;
  auto: number;
}

export interface ParetoEntry extends FlowDetail {
  share: number;
}

export interface Move {
  id: string;
  name: string;
}

export interface Rating {
  actual: KPIResult;
  optimized: Station[];
  opt: KPIResult;
  scores: RatingScores;
  composite: number;
  letter: Letter;
  flowReductionPct: number;
  pareto: ParetoEntry[];
  moves: Move[];
  balance: BalanceResult;
}

export function gradeLetter(score: number): Letter {
  return score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "E";
}

// Normalize an actual value against an achievable floor (lower is better).
export function scoreVsFloor(actual: number, floor: number): number {
  if (actual <= 0) return 100;
  if (floor <= 0) return 100;
  return Math.max(0, Math.min(100, (floor / actual) * 100));
}

export function buildRating(model: Model, opts: OptimizeOptions = {}): Rating {
  const { stations, flows } = model;
  const grid = { gridW: model.gridW, gridH: model.gridH, noGoZones: model.noGoZones };
  const shiftHours = model.shiftHours ?? DEFAULT_SHIFT_HOURS;

  const actual = computeKPIs(stations, flows, grid);
  // Score against the TRUE floor — the cheapest layout reachable by
  // repositioning (pairwise AND every cell form), not just pairwise swaps.
  // Otherwise a cell 29% off the shortest material path still grades ~100% on
  // flow, because the pairwise optimiser can't see the better form.
  const optimized = bestLayout(model, opts).stations;
  const opt = computeKPIs(optimized, flows, grid);

  const sFlow = scoreVsFloor(actual.flowCost, opt.flowCost);
  const sTravel = scoreVsFloor(actual.travel, opt.travel);
  // Congestion as the share of travel that does NOT cross the central corridor
  // (audit A-04). Self-contained — no dependence on the heuristic floor, whose
  // frequent zero-congestion value used to collapse this score to a constant
  // 100 and render the whole axis inert.
  const sCong = actual.travel > 0 ? Math.max(0, Math.min(100, Math.round((1 - actual.congestion / actual.travel) * 100))) : 100;
  // Real placement metric (compactness), not a copy of flow cost (audit A-03).
  const sPlace = placementScore(stations);
  const taktSec = customerTaktSec(model);
  const bal = balanceAnalysis(stations, flows, shiftHours, taktSec);
  const sBal = bal.score;
  const sErgo = ergoScore(stations, flows);
  const chain = chainRating(stations, flows);
  const sAuto = autoCoherenceScore(chain);

  const w = model.weights ? normalizeWeights(model.weights) : WEIGHTS;
  const composite =
    sFlow * w.flowCost +
    sTravel * w.travel +
    sCong * w.congestion +
    sPlace * w.placement +
    sBal * w.balance +
    sErgo * w.ergo +
    sAuto * w.auto;

  const flowReductionPct =
    actual.flowCost > 0 ? ((actual.flowCost - opt.flowCost) / actual.flowCost) * 100 : 0;

  const total = actual.flowCost || 1;
  const pareto: ParetoEntry[] = actual.flowDetail
    .slice()
    .sort((a, b) => b.cost - a.cost)
    .map((f) => ({ ...f, share: (f.cost / total) * 100 }));

  const byIdOpt: Record<string, Station> = {};
  optimized.forEach((s) => {
    byIdOpt[s.id] = s;
  });
  const moves: Move[] = [];
  stations.forEach((s) => {
    const o = byIdOpt[s.id];
    if (o && (o.x !== s.x || o.y !== s.y)) moves.push({ id: s.id, name: s.name });
  });

  return {
    actual,
    optimized,
    opt,
    scores: { flowCost: sFlow, travel: sTravel, congestion: sCong, placement: sPlace, balance: sBal, ergo: sErgo, auto: sAuto },
    composite,
    letter: gradeLetter(composite),
    flowReductionPct,
    pareto,
    moves,
    balance: bal,
  };
}
