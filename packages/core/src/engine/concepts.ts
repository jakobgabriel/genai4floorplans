import type { AutoState, ErgoRisk, StationType, Transport } from "../model/types";
import type { CustomField } from "../model/library";
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
//
// They used to be a frozen TypeScript constant, and the whole comparison the
// tool exists to produce turned on numbers nobody outside this file could see
// or change. A plant whose U-cells cost 60k a station, or that runs a concept
// this list has never heard of, had no way to say so — the tool would rank its
// options against somebody else's machine park and present the answer as fact.
// docs/spec-alignment.md called this out: §29 and §35 both require rules-as-data
// and this was the counter-example.
//
// So a catalog is now DATA, passed in. The set below is the starting point the
// app ships with — not a hidden constant but a visible, editable default, and
// unlike the process library it is not empty: without at least one concept
// there is nothing to compare, and these five are industry archetypes rather
// than one plant's private knowledge.

/** A concept id. Free-form, because a planner can add their own. */
export type ConceptKind = string;

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
  /** Free-form fields the planner adds. Never read by any engine. */
  custom?: CustomField[];
}

export type ConceptCatalog = Record<ConceptKind, ConceptProfile>;

/** Index a list of profiles by kind, for the engines that look one up. */
export function byKind(list: ConceptProfile[]): ConceptCatalog {
  const out: ConceptCatalog = {};
  list.forEach((c) => {
    out[c.kind] = c;
  });
  return out;
}

/**
 * The catalog the app ships with.
 *
 * Editable in the UI and overridable per brief. Nothing in the engines reads
 * this directly except as a default argument.
 */
export const CONCEPT_DEFAULTS: ConceptCatalog = {
  "job-shop": {
    kind: "job-shop",
    label: "Job shop",
    blurb: "Standalone machines grouped by process, parts moved in batches. Maximum flexibility, worst flow.",
    viableVolume: [0, 15000],
    // W first: a job shop laid out as a flow path is not a job shop. The
    // defining property is that the machines are grouped by process and stand
    // apart, so a part crosses the floor between operations — which is exactly
    // the transport penalty the flow-oriented concepts are being weighed
    // against. L and S stay as the tidier variants a small shop can manage.
    forms: ["W", "L", "S"],
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
    forms: ["I", "L", "C"],
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
    forms: ["U", "L", "S", "O"],
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
    forms: ["I", "S", "P"],
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
export function conceptFit(kind: ConceptKind, annualVolume: number, catalog: ConceptCatalog = CONCEPTS): number {
  const profile = catalog[kind];
  if (!profile) return 0;
  const [lo, hi] = profile.viableVolume;
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

/** Concepts ordered by how well they fit a volume, best first. */
export function rankConcepts(
  annualVolume: number,
  catalog: ConceptCatalog = CONCEPTS,
): Array<{ kind: ConceptKind; fit: number }> {
  return Object.keys(catalog)
    .map((kind) => ({ kind, fit: conceptFit(kind, annualVolume, catalog) }))
    .sort((a, b) => b.fit - a.fit);
}

/** A new concept for the planner to fill in, at defensible neutral values. */
export function blankConcept(kind: string, label: string): ConceptProfile {
  return {
    kind,
    label,
    blurb: "",
    viableVolume: [0, 1000000],
    forms: ["I"],
    auto: "manual",
    stationType: "machine",
    operatorsPerStation: 1,
    allowsParallel: true,
    capexPerStation: 0,
    cycleFactor: 1,
    handlingShare: 0.25,
    transport: "manual",
    energyKw: 0,
    changeoverMin: 0,
    ergoRisk: "low",
    custom: [],
  };
}

/**
 * The default catalog under its historical name, and the order it reads in.
 *
 * Kept so the engines have a default argument and the tests have a fixture.
 * Anything user-facing takes the catalog as a parameter instead.
 */
export const CONCEPTS: ConceptCatalog = CONCEPT_DEFAULTS;
export const CONCEPT_KINDS: ConceptKind[] = Object.keys(CONCEPT_DEFAULTS);
