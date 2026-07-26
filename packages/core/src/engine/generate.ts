import type { Confidence, CycleBreakdown, Demand, ErgoRisk, ErgonomicLoad, Flow, Model, StationType, TimeMethod, Transport, VariantMode, WasteClass, WorkClass } from "../model/types";
import { DEFAULT_COST_CONFIG, DEFAULT_SHIFT_HOURS, DEFAULT_SHIFT_MODEL, SCHEMA_VERSION } from "../model/types";
import type { RawStep } from "./infer";
import { normalizeFlow, normalizeStation } from "../model/defaults";
import type { CellForm } from "./templates";
import { cellTopology } from "./topology";
import { clampToGrid } from "./geometry";
import { CONCEPTS, CONCEPT_KINDS, conceptFit, type ConceptKind } from "./concepts";
import { buildRating, type Letter, type Rating } from "./rating";
import { costAnalysis, type CostResult } from "./cost";
import { buildWorkloadStations } from "./generateCell";

// Concept generation (lifecycle case 2).
//
// Enumerate concept × cell form, build a complete costed cell for each, score
// every one with the ordinary engine, and rank. Deliberately brute force: the
// candidate space is small (5 concepts × ≤3 forms) and each solve is a normal
// buildRating, so the whole sweep is deterministic and reproducible. No search,
// no randomness — the same brief always produces the same ranking.

export interface ProcessStep {
  name: string;
  /** Base manual cycle time in seconds; concepts scale it. Omit to have it
   *  inferred from the step name's matched capability. */
  cycleTimeSec?: number;
  /** Overrides the concept's default station type when set. */
  type?: StationType;
  ergoRisk?: ErgoRisk;
  /** Fraction of parts scrapped at this step (0–1). */
  scrapRate?: number;
  // ---- data-model-faithful overrides (all optional; absent ⇒ inferred) ----
  /** Capability id chosen from the catalog rather than matched from the name. */
  capabilityId?: string;
  /** Value-add / necessary-NVA / waste classification of the work. */
  classification?: WorkClass;
  /** Which of the seven wastes, when NVA/NNVA. */
  wasteClass?: WasteClass;
  /** 0–1 operator binding (drives operator/machine separation + automation). */
  attendedFraction?: number;
  /** Physical load of the work. */
  ergonomicLoad?: ErgonomicLoad;
  /** How the cycle time was obtained. */
  timeMethod?: TimeMethod;
  /** Confidence in the cycle time. */
  confidence?: Confidence;
  /** Predecessors as 0-based indices into the step list — expresses a DAG. */
  predecessors?: number[];
  /** Per-part value-add / NVA decomposition. When set, cycle time = its sum. */
  cycle?: CycleBreakdown;
  /** Parts processed together in one cycle (multi-cavity die, batch fixture).
   *  Default 1. Multiplies part throughput without adding a machine. */
  partsPerCycle?: number;
}

export interface GenerateBrief {
  name: string;
  steps: ProcessStep[];
  /** Demand in good parts per year. */
  annualVolume: number;
  annualShifts?: number;
  shiftHours?: number;
  /** Restrict the sweep to these concepts. Defaults to all five. */
  concepts?: ConceptKind[];
  currency?: string;
  laborCostPerHour?: number;
  /** Program length used to amortise capex into the loaded cost per part. */
  programYears?: number;
  /** Mix modes for mixed-model balancing (spec §3.2). */
  variantModes?: VariantMode[];
  /** Multi-year demand + shift model. When present it is carried onto every
   *  generated model (capacity analysis) and its shift model overrides the
   *  scalar annualShifts/shiftHours where those are not separately given. */
  demand?: Demand;
  /** Default transport mode for the generated inter-station flows. Falls back
   *  to the concept's transport when unset. */
  defaultTransport?: Transport;
  /** Default part weight (kg) stamped on the generated flows. Default 1. */
  defaultPartWeightKg?: number;
}

export const DEFAULT_PROGRAM_YEARS = 5;

export interface CandidateMetrics {
  composite: number;
  letter: Letter;
  lineOut: number;
  takt: number;
  balanceScore: number;
  /** Operating cost only — labour + energy + transport. Excludes capex. */
  costPerPart: number;
  /** Capex amortised over the program: capex ÷ (annualVolume × programYears). */
  capexPerPart: number;
  /** costPerPart + capexPerPart. The number a business case turns on. */
  loadedCostPerPart: number;
  capexTotal: number;
  /** How far line output exceeds demand, %. Lane rounding makes this unavoidable,
   *  but buying 50% too much line should never be invisible. */
  overCapacityPct: number;
  opexPerShift: number;
  operators: number;
  stations: number;
  parallelUnits: number;
  /** Line output clears the per-shift demand. */
  meetsDemand: boolean;
  /** 0–100 suitability of the concept for this annual volume. */
  conceptFit: number;
  valueAddPct: number;
  /** Weighted 0–100 score across every criterion. Set by `scoreCandidates`. */
  decisionScore?: number;
  /** The per-criterion 0–100 scores that made it, so the number can be argued with. */
  criteria?: { cost: number; capex: number; fit: number; operators: number; flexibility: number };
}

export interface Candidate {
  id: string;
  concept: ConceptKind;
  conceptLabel: string;
  form: CellForm;
  model: Model;
  rating: Rating;
  cost: CostResult;
  metrics: CandidateMetrics;
  rationale: string;
}

export type RankBy = "loadedCostPerPart" | "composite" | "costPerPart" | "capexTotal" | "lineOut" | "operators" | "conceptFit";

const MINIMIZE: RankBy[] = ["loadedCostPerPart", "costPerPart", "capexTotal", "operators"];

export interface CandidateFilters {
  /** Drop candidates that cannot make the demand. */
  meetsDemandOnly?: boolean;
  maxCapex?: number;
  maxCostPerPart?: number;
  maxOperators?: number;
  concepts?: ConceptKind[];
}

// ---- model construction ---------------------------------------------------

/** Columns reserved at each end for the incoming/shipping areas. */
const END_MARGIN = 5;

function gridFor(n: number): { gridW: number; gridH: number } {
  // Enough room for the template band plus both end margins.
  return { gridW: Math.max(26, Math.min(64, n * 5 + 16)), gridH: 14 };
}

/** Build one concept x form candidate model, sized for demand. */
/** Shifts per year implied by a demand's shift model (shifts/day × working days). */
function shiftsFromDemand(d: Demand | undefined): number | undefined {
  if (!d) return undefined;
  const perDay = d.shiftsPerDay ?? DEFAULT_SHIFT_MODEL.shiftsPerDay;
  const days = d.workingDaysPerYear ?? DEFAULT_SHIFT_MODEL.workingDaysPerYear;
  return perDay > 0 && days > 0 ? perDay * days : undefined;
}

function buildModel(brief: GenerateBrief, concept: ConceptKind, form: CellForm, perShiftTarget: number): Model {
  const p = CONCEPTS[concept];
  const shiftHours = brief.shiftHours ?? brief.demand?.hoursPerShift ?? DEFAULT_SHIFT_HOURS;
  const grid = gridFor(brief.steps.length);

  // Entry and exit belong to the FORM, not to the grid edges. A U-cell puts
  // load and unload side by side at the open end; placing shipping at the far
  // right would cancel out the return leg and make the U pointless.
  const layout = cellTopology(form, brief.steps.length, {
    gridW: grid.gridW - END_MARGIN * 2,
    gridH: grid.gridH,
  });
  const shift = (sl: { x: number; y: number }) => ({ x: sl.x + END_MARGIN, y: sl.y });
  const entry = shift(layout.entry);
  const exitAt = shift(layout.exit);

  const io = (id: string, name: string, role: "input" | "output", at: { x: number; y: number }) =>
    normalizeStation({
      id,
      name,
      role,
      type: "store",
      x: at.x,
      y: at.y,
      w: 3,
      h: 2,
      // A GENERATED layout is a starting point, not a constraint: the generator
      // cannot know which areas are truly anchored, so it pins nothing. Movable
      // incoming/shipping let the optimiser (and the planner) reshape the cell —
      // I/O reflow with the form, which is where the biggest shape gains come
      // from. A real fixed dock is set by the planner afterwards.
      fixed: false,
      operators: 0,
      cycleTimeSec: 0,
      capacityPerShift: Math.max(1000, Math.ceil(perShiftTarget * 2)),
      utilities: [],
      changeoverMin: 0,
      notes: role === "input" ? "Inbound staging" : "Outbound dock",
    });

  const input = io("in", "Incoming", "input", entry);
  const output = io("out", "Shipping", "output", exitAt);

  // Each defined process step maps to exactly ONE station — the guided planner
  // lets the user enumerate discrete steps, and they must see those same steps
  // carried through to the concept and the layout (not a balancer's merged
  // subset). Takt still drives manning and parallel lanes, so a slow step is
  // sized honestly; only the merging of distinct steps is suppressed.
  // Each step carries whatever the planner overrode; the rest is inferred.
  const rawSteps: RawStep[] = brief.steps.map((st) => ({
    name: st.name,
    seconds: st.cycleTimeSec,
    capabilityId: st.capabilityId,
    classification: st.classification,
    wasteClass: st.wasteClass,
    attendedFraction: st.attendedFraction,
    ergonomicLoad: st.ergonomicLoad,
    timeMethod: st.timeMethod,
    confidence: st.confidence,
    predecessors: st.predecessors,
    cycle: st.cycle,
    scrapRate: st.scrapRate,
    partsPerCycle: st.partsPerCycle,
  }));
  const built = buildWorkloadStations(
    rawSteps,
    perShiftTarget,
    shiftHours,
    brief.variantModes,
    {
      cycleFactor: p.cycleFactor,
      capexPerStation: p.capexPerStation,
      energyKw: p.energyKw,
      changeoverMin: p.changeoverMin,
      oneStationPerStep: true,
      auto: p.auto,
      operatorsPerStation: p.operatorsPerStation,
    },
  );
  const procs = built.stations;

  // Place the stations on the form's path. With one station per step the count
  // equals the planner's step list, but re-solving keeps this robust if a step
  // ever drops out (e.g. an empty name).
  const placed = cellTopology(form, procs.length, { gridW: grid.gridW - END_MARGIN * 2, gridH: grid.gridH });
  procs.forEach((st, i) => {
    const slot = placed.slots[i];
    if (slot) {
      const { x, y } = clampToGrid(st, slot.x + END_MARGIN, slot.y, grid.gridW, grid.gridH);
      st.x = x;
      st.y = y;
    }
  });
  // Entry/exit follow the re-solved path too, so they stay attached to the ends.
  const e2 = shift(placed.entry);
  const x2 = shift(placed.exit);
  input.x = e2.x;
  input.y = e2.y;
  output.x = x2.x;
  output.y = x2.y;

  const chain = [input, ...procs, output];
  const flows: Flow[] = [];
  for (let i = 0; i < chain.length - 1; i++) {
    flows.push(
      normalizeFlow({
        from: chain[i].id,
        to: chain[i + 1].id,
        volume: Math.round(perShiftTarget),
        transport: brief.defaultTransport ?? p.transport,
        unitCost: 0.05,
        partWeightKg: brief.defaultPartWeightKg ?? 1,
      }),
    );
  }

  const base: Model = {
    schemaVersion: SCHEMA_VERSION,
    name: `${brief.name} — ${p.label} (${form})`,
    gridW: grid.gridW,
    gridH: grid.gridH,
    shiftHours,
    stations: chain,
    flows,
    noGoZones: [],
    conceptKind: concept,
    costConfig: {
      annualShifts: brief.annualShifts ?? shiftsFromDemand(brief.demand) ?? DEFAULT_COST_CONFIG.annualShifts,
      laborCostPerHour: brief.laborCostPerHour ?? DEFAULT_COST_CONFIG.laborCostPerHour,
      currency: brief.currency ?? DEFAULT_COST_CONFIG.currency,
    },
    // Carry the workload's multi-year demand and mix modes so capacity analysis
    // and mixed-model balancing survive onto the persisted model.
    ...(brief.demand ? { demand: brief.demand } : {}),
    ...(brief.variantModes && brief.variantModes.length ? { variantModes: brief.variantModes } : {}),
  };

  // No separate lane-sizing pass: the balancer already produces stations that
  // each fit within takt, so capacity is an outcome of the assignment.
  return base;
}

// ---- generation -----------------------------------------------------------

function rationaleFor(concept: ConceptKind, m: CandidateMetrics, perShiftTarget: number, currency: string): string {
  const p = CONCEPTS[concept];
  const bits: string[] = [p.blurb];
  if (!m.meetsDemand) {
    bits.push(`Falls short of demand — ${m.lineOut.toLocaleString()}/shift against ${Math.round(perShiftTarget).toLocaleString()} needed.`);
  } else if (m.parallelUnits > m.stations) {
    bits.push(`Needs ${m.parallelUnits - m.stations} extra lane(s) to hit takt.`);
  }
  if (m.conceptFit < 50) bits.push("Volume sits outside this concept's usual range.");
  if (m.overCapacityPct >= 25) bits.push(`Sized ${m.overCapacityPct}% above demand — lane rounding buys capacity you may not need.`);
  bits.push(
    `${currency}${m.loadedCostPerPart.toFixed(2)}/part fully loaded ` +
      `(${currency}${m.costPerPart.toFixed(2)} operating + ${currency}${m.capexPerPart.toFixed(2)} capex), ` +
      `${m.operators} operator(s).`,
  );
  return bits.join(" ");
}

/**
 * Sweep concept × form and return every candidate, engine-scored.
 *
 * Every number on a candidate comes from the normal engine (buildRating,
 * costAnalysis) — the generator only assembles models, exactly as the AI layer
 * only emits models and lets verify.ts score them.
 */
export function generateCandidates(brief: GenerateBrief): Candidate[] {
  if (brief.steps.length === 0) return [];
  const shifts = brief.annualShifts ?? shiftsFromDemand(brief.demand) ?? DEFAULT_COST_CONFIG.annualShifts;
  const perShiftTarget = brief.annualVolume > 0 ? brief.annualVolume / shifts : 0;
  const kinds = brief.concepts?.length ? brief.concepts : CONCEPT_KINDS;
  const currency = brief.currency ?? DEFAULT_COST_CONFIG.currency;

  const out: Candidate[] = [];
  kinds.forEach((concept) => {
    CONCEPTS[concept].forms.forEach((form) => {
      const model = buildModel(brief, concept, form, perShiftTarget);
      // restarts: 0 keeps the sweep deterministic and fast — the candidate is a
      // starting point, and the user can run the full optimizer on the winner.
      const rating = buildRating(model, { restarts: 0 });
      const cost = costAnalysis(model);
      const procs = model.stations.filter((s) => s.role === "process");
      const parallelUnits = procs.reduce((a, s) => a + Math.max(1, s.parallelUnits ?? 1), 0);
      const operators = procs.reduce((a, s) => a + s.operators * Math.max(1, s.parallelUnits ?? 1), 0);
      const vaSec = procs.reduce((a, s) => a + (s.cycle?.valueAddSec ?? 0), 0);
      const totalSec = procs.reduce((a, s) => a + s.cycleTimeSec, 0);

      const programParts = brief.annualVolume * (brief.programYears ?? DEFAULT_PROGRAM_YEARS);
      const capexPerPart = programParts > 0 ? +(cost.capexTotal / programParts).toFixed(3) : 0;

      const metrics: CandidateMetrics = {
        composite: +rating.composite.toFixed(1),
        letter: rating.letter,
        lineOut: rating.balance.lineOut,
        takt: rating.balance.takt,
        balanceScore: rating.balance.score,
        costPerPart: cost.costPerPart,
        capexPerPart,
        loadedCostPerPart: +(cost.costPerPart + capexPerPart).toFixed(3),
        capexTotal: cost.capexTotal,
        overCapacityPct:
          perShiftTarget > 0 ? Math.max(0, Math.round(((rating.balance.lineOut - perShiftTarget) / perShiftTarget) * 100)) : 0,
        opexPerShift: cost.opexPerShift,
        operators,
        stations: procs.length,
        parallelUnits,
        meetsDemand: perShiftTarget <= 0 || rating.balance.lineOut >= Math.floor(perShiftTarget),
        conceptFit: conceptFit(concept, brief.annualVolume),
        valueAddPct: totalSec > 0 ? +((vaSec / totalSec) * 100).toFixed(1) : 0,
      };

      out.push({
        id: `${concept}-${form}`,
        concept,
        conceptLabel: CONCEPTS[concept].label,
        form,
        model,
        rating,
        cost,
        metrics,
        rationale: rationaleFor(concept, metrics, perShiftTarget, currency),
      });
    });
  });

  return out;
}

/** Sort candidates by one metric. Cost/capex/operators sort ascending. */
export function rankCandidates(candidates: Candidate[], by: RankBy = "loadedCostPerPart"): Candidate[] {
  const min = MINIMIZE.includes(by);
  return candidates.slice().sort((a, b) => {
    // Candidates that cannot make the demand always sort last, whatever the metric.
    if (a.metrics.meetsDemand !== b.metrics.meetsDemand) return a.metrics.meetsDemand ? -1 : 1;
    const av = a.metrics[by];
    const bv = b.metrics[by];
    if (av === bv) return a.id.localeCompare(b.id); // stable, deterministic
    return min ? av - bv : bv - av;
  });
}

export function filterCandidates(candidates: Candidate[], f: CandidateFilters): Candidate[] {
  return candidates.filter((c) => {
    if (f.meetsDemandOnly && !c.metrics.meetsDemand) return false;
    if (f.maxCapex != null && c.metrics.capexTotal > f.maxCapex) return false;
    if (f.maxCostPerPart != null && c.metrics.costPerPart > f.maxCostPerPart) return false;
    if (f.maxOperators != null && c.metrics.operators > f.maxOperators) return false;
    if (f.concepts?.length && !f.concepts.includes(c.concept)) return false;
    return true;
  });
}

export interface CrossoverPoint {
  annualVolume: number;
  winner: ConceptKind;
  winnerLabel: string;
  costPerPart: number;
}

/**
 * Sweep a volume range and report the best concept at each point — the "concept
 * A wins below 120k/yr, B above" chart that RFQ decisions actually turn on.
 */
export function conceptCrossover(brief: GenerateBrief, volumes: number[], by: RankBy = "loadedCostPerPart"): CrossoverPoint[] {
  return volumes.map((annualVolume) => {
    const ranked = rankCandidates(
      filterCandidates(generateCandidates({ ...brief, annualVolume }), { meetsDemandOnly: true }),
      by,
    );
    const best = ranked[0];
    return {
      annualVolume,
      winner: best?.concept ?? "cell",
      winnerLabel: best ? best.conceptLabel : "—",
      costPerPart: best?.metrics.loadedCostPerPart ?? 0,
    };
  });
}

// ---- weighted decision ranking, crossover & sensitivity -------------------
// Ported from the planner rework: rank candidates by an editable weighting of
// several criteria (not cost alone), show where the best concept flips as the
// brief changes, and how sensitive the ranking is to each assumption.
export interface CrossoverSegment {
  /** Inclusive lower bound of the stretch. */
  from: number;
  /** Exclusive upper bound; null when the stretch runs to the top of the sweep. */
  to: number | null;
  /** Null when nothing in the catalog can make the demand across this stretch. */
  winner: ConceptKind | null;
  winnerLabel: string;
  /** Best loaded cost per part seen in the stretch. */
  costPerPart: number;
  /**
   * How far ahead the winner is of the best *other concept*, as a percentage of
   * the winner's cost, at its narrowest point in this stretch.
   *
   * A stretch the tool "wins" by 0.4% is not a recommendation, it is a coin
   * toss between two sets of planning assumptions, and saying so is the
   * difference between a decision aid and a decision.
   */
  minMarginPct: number;
}

export interface CrossoverOptions {
  /** Lowest volume to sweep. */
  from?: number;
  /** Highest volume to sweep. */
  to?: number;
  /** Sample points, log-spaced. Each one runs a full sweep, so keep it small. */
  samples?: number;
  /** Bisection steps used to pin each boundary down. 0 skips the refinement. */
  refine?: number;
  by?: RankBy;
}

/** The winner at one volume, plus how close the nearest other concept was. */
function bestAt(brief: GenerateBrief, annualVolume: number, by: RankBy) {
  const ranked = rankCandidates(
    filterCandidates(generateCandidates({ ...brief, annualVolume }), { meetsDemandOnly: true }),
    by,
  );
  const best = ranked[0];
  if (!best) return { winner: null, label: "\u2014", cost: 0, marginPct: 0 };
  // The runner-up has to be a different CONCEPT. The same concept in another
  // form is not an alternative decision, and counting it would report every
  // margin as near zero.
  const other = ranked.find((c) => c.concept !== best.concept);
  const bc = best.metrics.loadedCostPerPart;
  const marginPct = other && bc > 0 ? ((other.metrics.loadedCostPerPart - bc) / bc) * 100 : 100;
  return { winner: best.concept, label: best.conceptLabel, cost: bc, marginPct: Math.max(0, marginPct) };
}

/**
 * The crossover as ranges rather than samples.
 *
 * Sampling alone gives you "at 24,621 the winner was already a U-cell", which
 * is an artefact of where the samples happened to fall. Each boundary is
 * bisected afterwards so the number reported is the volume where the answer
 * actually changes, to within the tolerance of the refinement.
 *
 * Stretches where nothing meets demand are returned with a null winner rather
 * than dropped: "above 400k/yr nothing in your catalog makes this on one line"
 * is one of the more useful things this sweep can tell you.
 */
export function conceptCrossoverRanges(brief: GenerateBrief, opts: CrossoverOptions = {}): CrossoverSegment[] {
  const from = Math.max(1, opts.from ?? 1000);
  const to = Math.max(from * 10, opts.to ?? 10000000);
  const samples = Math.max(3, opts.samples ?? 12);
  const refine = Math.max(0, opts.refine ?? 4);
  const by = opts.by ?? "loadedCostPerPart";
  if (brief.steps.length === 0) return [];

  const lf = Math.log10(from);
  const lt = Math.log10(to);
  const at = (i: number) => Math.round(Math.pow(10, lf + ((lt - lf) * i) / (samples - 1)));

  const points = Array.from({ length: samples }, (_, i) => {
    const v = at(i);
    return { v, ...bestAt(brief, v, by) };
  });

  // Collapse consecutive same-winner samples, then pin the boundary between
  // each pair by bisecting in log space.
  const segs: CrossoverSegment[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const prev = segs[segs.length - 1];
    if (prev && prev.winner === p.winner) {
      // Guarded: a stretch with no winner has no cost, and `Math.min` over
      // nothing-but-zeroes was reporting Infinity.
      if (p.cost > 0) prev.costPerPart = prev.costPerPart > 0 ? Math.min(prev.costPerPart, p.cost) : p.cost;
      prev.minMarginPct = Math.min(prev.minMarginPct, p.marginPct);
      continue;
    }
    let boundary = p.v;
    if (prev) {
      if (refine > 0) {
        let lo = points[i - 1].v;
        let hi = p.v;
        for (let k = 0; k < refine; k++) {
          const mid = Math.round(Math.pow(10, (Math.log10(lo) + Math.log10(hi)) / 2));
          if (mid <= lo || mid >= hi) break;
          (bestAt(brief, mid, by).winner === points[i - 1].winner ? (lo = mid) : (hi = mid));
        }
        boundary = hi;
      }
      // Closed here rather than inside the refinement branch: with refinement
      // off, every stretch was left open-ended and the ranges neither met nor
      // covered the axis.
      prev.to = boundary;
    }
    segs.push({
      from: prev ? boundary : p.v,
      to: null,
      winner: p.winner,
      winnerLabel: p.label,
      costPerPart: p.cost,
      minMarginPct: p.marginPct,
    });
  }
  return segs;
}

// ---------------------------------------------------------------------------
// The decision score
// ---------------------------------------------------------------------------

/**
 * How much each criterion matters when ranking concepts.
 *
 * The ranking used to be `loadedCostPerPart` and nothing else. That is one
 * defensible objective out of several and it was never stated: capex exposure,
 * how well the concept suits the volume, manning and changeover burden were all
 * computed, all displayed, and none of them touched the order. A transfer line
 * could win on cost per part and be the wrong decision at that volume with that
 * mix uncertainty, and the tool would not say so.
 *
 * Weights are the fix, not a different hardcoded objective: the criteria are
 * named, the numbers are yours, and the winner changes when you change them.
 * Set everything but `cost` to zero and you get the old behaviour exactly.
 */
export interface DecisionWeights {
  /** Loaded cost per part. Lower is better. */
  cost: number;
  /** Total capital exposure. Lower is better. */
  capex: number;
  /** How well the concept suits the annual volume — its viable band. */
  fit: number;
  /** Operators required. Lower is better. */
  operators: number;
  /** Changeover burden across the line. Lower is better — a proxy for how
   *  cheaply the cell copes with a mix it was not planned for. */
  flexibility: number;
}

export const DECISION_WEIGHTS: DecisionWeights = {
  cost: 0.5,
  capex: 0.15,
  fit: 0.2,
  operators: 0.1,
  flexibility: 0.05,
};

/** Normalize to sum 1, so a UI can let the sliders go anywhere. */
export function normalizeDecisionWeights(w: DecisionWeights): DecisionWeights {
  const sum = w.cost + w.capex + w.fit + w.operators + w.flexibility;
  if (!(sum > 0)) return { ...DECISION_WEIGHTS };
  return {
    cost: w.cost / sum,
    capex: w.capex / sum,
    fit: w.fit / sum,
    operators: w.operators / sum,
    flexibility: w.flexibility / sum,
  };
}

/** Total changeover minutes across a candidate's process steps. */
function changeoverBurden(c: Candidate): number {
  return c.model.stations.filter((s) => s.role === "process").reduce((a, s) => a + (s.changeoverMin ?? 0), 0);
}

/**
 * Score every candidate 0–100 against the weights, in place.
 *
 * Each criterion is min-max normalised across the candidate set, so the scores
 * say "best of what is on offer here" rather than pretending to an absolute
 * scale. A criterion where every candidate is identical contributes nothing
 * rather than dividing by zero.
 */
export function scoreCandidates(candidates: Candidate[], weights: DecisionWeights = DECISION_WEIGHTS): Candidate[] {
  if (candidates.length === 0) return candidates;
  const w = normalizeDecisionWeights(weights);

  const raw = candidates.map((c) => ({
    cost: c.metrics.loadedCostPerPart,
    capex: c.metrics.capexTotal,
    fit: c.metrics.conceptFit,
    operators: c.metrics.operators,
    flexibility: changeoverBurden(c),
  }));

  const norm = (key: keyof DecisionWeights, lowerIsBetter: boolean) => {
    const vals = raw.map((r) => r[key]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    // Everything equal ⇒ the criterion cannot separate anything. Score it flat
    // rather than 0 or NaN, so it neither rewards nor punishes.
    if (!(hi > lo)) return vals.map(() => 100);
    return vals.map((v) => ((lowerIsBetter ? hi - v : v - lo) / (hi - lo)) * 100);
  };

  const parts = {
    cost: norm("cost", true),
    capex: norm("capex", true),
    fit: norm("fit", false),
    operators: norm("operators", true),
    flexibility: norm("flexibility", true),
  };

  candidates.forEach((c, i) => {
    c.metrics.decisionScore = +(
      parts.cost[i] * w.cost +
      parts.capex[i] * w.capex +
      parts.fit[i] * w.fit +
      parts.operators[i] * w.operators +
      parts.flexibility[i] * w.flexibility
    ).toFixed(1);
    c.metrics.criteria = {
      cost: +parts.cost[i].toFixed(1),
      capex: +parts.capex[i].toFixed(1),
      fit: +parts.fit[i].toFixed(1),
      operators: +parts.operators[i].toFixed(1),
      flexibility: +parts.flexibility[i].toFixed(1),
    };
  });
  return candidates;
}

/** Score, then rank by the weighted decision score (higher is better). */
export function rankByDecision(candidates: Candidate[], weights: DecisionWeights = DECISION_WEIGHTS): Candidate[] {
  return scoreCandidates(candidates, weights)
    .slice()
    .sort((a, b) => (b.metrics.decisionScore ?? 0) - (a.metrics.decisionScore ?? 0));
}

// ---------------------------------------------------------------------------
// Sensitivity
// ---------------------------------------------------------------------------

export interface SensitivityRow {
  /** What was varied. */
  factor: string;
  /** Human-readable low and high settings. */
  lowLabel: string;
  highLabel: string;
  lowWinner: string;
  highWinner: string;
  /** True when the winning concept is not the same at both ends. */
  flips: boolean;
}

export interface SensitivityResult {
  /** The winner at the brief as entered. */
  baseWinner: string;
  rows: SensitivityRow[];
  /** How many factors change the answer on their own. */
  flipCount: number;
}

/**
 * Does the answer survive being wrong about one thing?
 *
 * A brief is a set of estimates — the demand is a forecast, the labour rate is
 * a planning figure, the program length is a negotiation. Ranking them once and
 * reporting a winner says nothing about whether that winner holds if any single
 * one of them is off, which is the question a steering committee actually asks.
 *
 * Each factor is varied on its own, low and high, and the winning CONCEPT is
 * compared. Deliberately one-at-a-time: an interaction study needs a design of
 * experiments and this is meant to answer "how fragile is this" in one glance.
 */
export function sensitivity(
  brief: GenerateBrief,
  weights: DecisionWeights = DECISION_WEIGHTS,
  spreadPct = 30,
): SensitivityResult {
  const k = spreadPct / 100;
  const winnerOf = (b: GenerateBrief) => {
    const ranked = rankByDecision(filterCandidates(generateCandidates(b), { meetsDemandOnly: true }), weights);
    return ranked[0]?.conceptLabel ?? "—";
  };
  const baseWinner = winnerOf(brief);
  if (brief.steps.length === 0) return { baseWinner, rows: [], flipCount: 0 };

  const shifts = brief.annualShifts ?? DEFAULT_COST_CONFIG.annualShifts;
  const labour = brief.laborCostPerHour ?? DEFAULT_COST_CONFIG.laborCostPerHour;
  const years = brief.programYears ?? DEFAULT_PROGRAM_YEARS;

  const factors: Array<{ factor: string; lo: GenerateBrief; hi: GenerateBrief; loLabel: string; hiLabel: string }> = [
    {
      factor: "Annual demand",
      lo: { ...brief, annualVolume: Math.round(brief.annualVolume * (1 - k)) },
      hi: { ...brief, annualVolume: Math.round(brief.annualVolume * (1 + k)) },
      loLabel: `${Math.round(brief.annualVolume * (1 - k)).toLocaleString()}/yr`,
      hiLabel: `${Math.round(brief.annualVolume * (1 + k)).toLocaleString()}/yr`,
    },
    {
      factor: "Labour rate",
      lo: { ...brief, laborCostPerHour: +(labour * (1 - k)).toFixed(2) },
      hi: { ...brief, laborCostPerHour: +(labour * (1 + k)).toFixed(2) },
      loLabel: `${(labour * (1 - k)).toFixed(0)}/h`,
      hiLabel: `${(labour * (1 + k)).toFixed(0)}/h`,
    },
    {
      // Not "program length": in the planning flow this field carries the
      // amortisation-equivalent years (program volume ÷ peak volume), not the
      // calendar length of the program.
      factor: "Capex amortisation years",
      lo: { ...brief, programYears: Math.max(1, +(years * (1 - k)).toFixed(1)) },
      hi: { ...brief, programYears: +(years * (1 + k)).toFixed(1) },
      loLabel: `${Math.max(1, +(years * (1 - k)).toFixed(1))} yr`,
      hiLabel: `${(years * (1 + k)).toFixed(1)} yr`,
    },
    {
      factor: "Shifts per year",
      lo: { ...brief, annualShifts: Math.max(1, Math.round(shifts * (1 - k))) },
      hi: { ...brief, annualShifts: Math.round(shifts * (1 + k)) },
      loLabel: `${Math.max(1, Math.round(shifts * (1 - k)))}`,
      hiLabel: `${Math.round(shifts * (1 + k))}`,
    },
  ];

  const rows = factors.map((f) => {
    const lowWinner = winnerOf(f.lo);
    const highWinner = winnerOf(f.hi);
    return {
      factor: f.factor,
      lowLabel: f.loLabel,
      highLabel: f.hiLabel,
      lowWinner,
      highWinner,
      flips: lowWinner !== highWinner || lowWinner !== baseWinner || highWinner !== baseWinner,
    };
  });

  return { baseWinner, rows, flipCount: rows.filter((r) => r.flips).length };
}
