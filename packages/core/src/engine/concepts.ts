import type { AutoState, ErgoRisk, StationType, Transport } from "../model/types";
import type { CellForm } from "./templates";

// Manufacturing concepts (lifecycle case 2).
//
// A concept is the *organisational* choice — bench, cell, flow line, transfer
// line, job shop — and is orthogonal to CellForm, which is only the geometric
// arrangement. The concept decides automation level, manning, capex intensity
// and how work is parallelised; the form decides where the boxes sit.
//
// These profiles are deliberately coarse planning heuristics, not costed
// engineering data. They exist so a planner can compare concepts in seconds
// during an RFQ, then refine the winner by hand.

export type ConceptKind = "manual-bench" | "cell" | "flow-line" | "transfer-line" | "job-shop";

export const CONCEPT_KINDS: ConceptKind[] = ["job-shop", "manual-bench", "cell", "flow-line", "transfer-line"];

export interface ConceptProfile {
  kind: ConceptKind;
  label: string;
  blurb: string;
  /** Annual volume band where this concept is normally sensible. */
  viableVolume: [number, number];
  /** Cell forms this concept tends to use, best first. */
  forms: CellForm[];
  /** Automation state applied to generated process steps. */
  auto: AutoState;
  stationType: StationType;
  /** Operators manning each process step. */
  operatorsPerStation: number;
  /** May duplicate a step into parallel lanes to reach takt. */
  allowsParallel: boolean;
  /** Indicative equipment cost per step, in cost units. */
  capexPerStation: number;
  /** Cycle-time multiplier vs. the quoted manual base time. */
  cycleFactor: number;
  /** Handling share of the resulting cycle (drives the decomposition). */
  handlingShare: number;
  transport: Transport;
  /** Average power draw per step, kW. */
  energyKw: number;
  /** Changeover minutes per step — automation trades flexibility for speed. */
  changeoverMin: number;
  ergoRisk: ErgoRisk;
}

export const CONCEPTS: Record<ConceptKind, ConceptProfile> = {
  "job-shop": {
    kind: "job-shop",
    label: "Job shop",
    blurb: "Standalone machines grouped by process. Maximum flexibility, worst flow.",
    viableVolume: [0, 15000],
    forms: ["L", "S"],
    auto: "manual",
    stationType: "machine",
    operatorsPerStation: 1,
    allowsParallel: true,
    capexPerStation: 20000,
    cycleFactor: 1.4,
    handlingShare: 0.35,
    transport: "forklift",
    energyKw: 2,
    changeoverMin: 45,
    ergoRisk: "med",
  },
  "manual-bench": {
    kind: "manual-bench",
    label: "Manual bench",
    blurb: "Operators at benches. Lowest capex, highest labour per part.",
    viableVolume: [0, 30000],
    forms: ["I", "L"],
    auto: "manual",
    stationType: "manual",
    operatorsPerStation: 1,
    allowsParallel: true,
    capexPerStation: 5000,
    cycleFactor: 1.2,
    handlingShare: 0.3,
    transport: "manual",
    energyKw: 0.5,
    changeoverMin: 10,
    ergoRisk: "high",
  },
  cell: {
    kind: "cell",
    label: "U-cell",
    blurb: "Compact multi-process cell, part-in-part-out. Short flow, flexible manning.",
    viableVolume: [15000, 200000],
    forms: ["U", "W", "L", "S"],
    auto: "semi",
    stationType: "machine",
    operatorsPerStation: 1,
    allowsParallel: true,
    capexPerStation: 45000,
    cycleFactor: 1.0,
    handlingShare: 0.22,
    transport: "manual",
    energyKw: 3,
    changeoverMin: 20,
    ergoRisk: "low",
  },
  "flow-line": {
    kind: "flow-line",
    label: "Flow line",
    blurb: "Conveyor-linked stations in process order. Good flow, needs balancing.",
    viableVolume: [100000, 800000],
    forms: ["I", "S", "O"],
    auto: "semi",
    stationType: "machine",
    operatorsPerStation: 1,
    allowsParallel: true,
    capexPerStation: 95000,
    cycleFactor: 0.85,
    handlingShare: 0.15,
    transport: "conveyor",
    energyKw: 5,
    changeoverMin: 35,
    ergoRisk: "low",
  },
  "transfer-line": {
    kind: "transfer-line",
    label: "Transfer line",
    blurb: "Rigidly linked automated stations. Lowest cost per part, no flexibility.",
    viableVolume: [500000, 100000000],
    forms: ["I"],
    auto: "auto",
    stationType: "machine",
    operatorsPerStation: 0,
    allowsParallel: false,
    capexPerStation: 260000,
    cycleFactor: 0.6,
    handlingShare: 0.08,
    transport: "conveyor",
    energyKw: 12,
    changeoverMin: 90,
    ergoRisk: "low",
  },
};

/**
 * How well a concept suits an annual volume, 0–100.
 *
 * Scores 100 in the middle of the band and tapers to 0 one band-width outside
 * it, so a concept just past its range is penalised rather than excluded —
 * planners need to see the near-misses to understand the crossover.
 */
export function conceptFit(kind: ConceptKind, annualVolume: number): number {
  const [lo, hi] = CONCEPTS[kind].viableVolume;
  if (annualVolume <= 0) return 0;
  if (annualVolume >= lo && annualVolume <= hi) return 100;
  // Work in log space: volume bands span orders of magnitude.
  const l = Math.log10(Math.max(1, annualVolume));
  const lLo = Math.log10(Math.max(1, lo || 1));
  const lHi = Math.log10(Math.max(1, hi));
  const dist = l < lLo ? lLo - l : l - lHi;
  const tolerance = 1; // one decade outside the band => 0
  return Math.max(0, Math.round((1 - dist / tolerance) * 100));
}

/** Concepts ordered by how well they fit a volume, best first.
 *
 *  Equal volume fit is broken by the lean default (spec §9, "lowest automation
 *  meeting takt wins by default; escalation needs justification"): the cheaper,
 *  less-automated concept ranks first. Without this, overlapping volume bands
 *  tied at 100 in arbitrary declaration order (audit C-06). This is a coarse
 *  screen; the primary concept comparison is the fully-loaded cost ranking over
 *  generated cells in generate.ts (RankBy), which weighs capex, opex, ergo and
 *  balance together. */
export function rankConcepts(annualVolume: number): Array<{ kind: ConceptKind; fit: number }> {
  return CONCEPT_KINDS.map((kind) => ({ kind, fit: conceptFit(kind, annualVolume) })).sort(
    (a, b) => b.fit - a.fit || CONCEPTS[a.kind].capexPerStation - CONCEPTS[b.kind].capexPerStation,
  );
}
