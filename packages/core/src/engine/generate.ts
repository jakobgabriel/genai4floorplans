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

  // The stations are BALANCED from the work elements, not mapped 1:1 from the
  // planner's step list. How many stations exist is an output of the balancer.
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
    },
  );
  const procs = built.stations;

  // Place the balanced stations on the form's path. The topology was solved for
  // the number of steps the planner gave; the balancer may have produced fewer,
  // so re-solve for the actual station count.
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
