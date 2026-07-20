// FlowPlan canonical data model. Mirrors spec §3 and the demo's JSON shape.
// The whole layout is a single Model object; Export produces exactly this and
// Import fills missing fields with defaults (see model/defaults.ts).

export type Role = "input" | "process" | "output";
export type StationType = "machine" | "manual" | "quality" | "store" | "buffer";
export type AutoState = "manual" | "semi" | "auto";
export type AutoOverride = "yes" | "no" | null;
export type ErgoRisk = "low" | "med" | "high";
export type Transport = "manual" | "forklift" | "conveyor" | "agv";
/** Which edge of a station's bounding box a port sits on. */
export type Side = "left" | "right" | "top" | "bottom";
/** How a station's output divides across its outgoing flows. */
export type SplitMode = "distribute" | "fork";
/** How a station combines its incoming flows. */
export type MergeMode = "sum" | "assemble";

/** Per-part cycle time split into value-add and the four non-value-add classes.
 *  Optional: when absent a station is "not decomposed" and cycleTimeSec is the
 *  only truth. When present it is authoritative — normalizeStation keeps
 *  cycleTimeSec in sync with the sum, so every legacy reader stays correct. */
export interface CycleBreakdown {
  /** Work that transforms the part. The only value-adding class. */
  valueAddSec: number;
  /** Load / unload / part presentation. */
  handlingSec: number;
  /** Operator travel between stations. */
  walkSec: number;
  /** Blocked or starved time inside the cycle. */
  waitSec: number;
  /** Changeover amortised over the batch. */
  setupSec: number;
}

/** Keys of CycleBreakdown, in the order they should be stacked for display. */
export const CYCLE_KEYS = ["valueAddSec", "handlingSec", "walkSec", "waitSec", "setupSec"] as const;
export type CycleKey = (typeof CYCLE_KEYS)[number];

/** Sum of a breakdown. Pure arithmetic so the model layer stays dependency-free. */
export function sumCycle(c: CycleBreakdown): number {
  return c.valueAddSec + c.handlingSec + c.walkSec + c.waitSec + c.setupSec;
}

export interface Station {
  id: string;
  name: string;
  role: Role;
  type: StationType;
  x: number;
  y: number;
  w: number;
  h: number;
  fixed: boolean;
  auto: AutoState;
  autoOverride: AutoOverride;
  capacityPerShift: number;
  operators: number;
  cycleTimeSec: number;
  changeoverMin: number;
  ergoRisk: ErgoRisk;
  utilities: string[];
  notes: string;
  /** Per-station shift length in hours (Phase 2). Defaults to model/global 8h. */
  shiftHours?: number;
  /** Occupied cell offsets within the w×h bounding box. Absent ⇒ full rectangle. */
  cells?: Array<[number, number]>;
  /** Edge where material enters / exits / scrap leaves. Default left / right / bottom. */
  inSide?: Side;
  outSide?: Side;
  scrapSide?: Side;
  /** Fraction of incoming parts scrapped at this step (0–1). Default 0. */
  scrapRate?: number;
  /** Number of identical parallel resources at this step. Default 1 (capacity ×N). */
  parallelUnits?: number;
  /** How this step's output divides across outgoing flows. Default "distribute". */
  splitMode?: SplitMode;
  /** How this step combines incoming flows. Default "sum". */
  mergeMode?: MergeMode;
  /** One-time capital cost of the step's equipment (cost units). Default 0. */
  capex?: number;
  /** Estimated cost to automate this step (drives ROI payback). Default 0. */
  automationCapex?: number;
  /** Average power draw in kW (drives energy opex). Default 0. */
  energyKw?: number;
  /** Value-add / non-value-add split of cycleTimeSec. Absent ⇒ not decomposed. */
  cycle?: CycleBreakdown;
  /** Capability ids this resource provides (spec §3.4). Drives gate 1 coverage:
   *  a cell needs capabilities, resources provide them, and it is the N:M
   *  relation that generates alternatives. Absent ⇒ provides nothing declared. */
  provides?: string[];
  /** Annual volume band this resource is validated for (spec §3.4, gate 2). */
  volumeBand?: { minUnitsPerYear: number; maxUnitsPerYear: number };
}

/** Cost assumptions for the ROI model. Informational — not in the composite. */
export interface CostConfig {
  laborCostPerHour?: number;
  energyCostPerKwh?: number;
  annualShifts?: number;
  currency?: string;
}

export interface Flow {
  from: string;
  to: string;
  volume: number;
  unitCost: number;
  transport: Transport;
  partWeightKg: number;
  notes: string;
  /** Share (0–1) of the source's output routed here for a "distribute" split. */
  share?: number;
  /** Units of this input consumed per assembled unit at an "assemble" merge. Default 1. */
  unitsPerAssembly?: number;
}

export interface NoGoZone {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}

/** Composite-rating weights (spec §4). Defined here so the model can carry an
 *  override without importing from the engine. Defaults live in engine/rating.ts. */
export interface RatingWeights {
  flowCost: number;
  travel: number;
  congestion: number;
  placement: number;
  balance: number;
  ergo: number;
  auto: number;
}

// ---- workload (Cell Design spec §3.2) -------------------------------------
//
// The product-free input. A workload states *what must be done*, never what is
// being made. This is what lets one line carry 40 products without modelling 40
// products: products that share work content collapse into a single variant
// mode, and only genuine differences in work content become separate modes.

export type TimeMethod = "MTM" | "UAS" | "estimate" | "benchmarked" | "measured";
export type Confidence = "low" | "med" | "high";

/** Value-add / necessary-non-value-add / pure waste. */
export type WorkClass = "VA" | "NNVA" | "NVA";

export type WasteClass =
  | "transport"
  | "motion"
  | "waiting"
  | "overprocessing"
  | "inventory"
  | "defects"
  | "overproduction";

export type ErgonomicLoad = "light" | "medium" | "heavy";

/** A time value that carries where it came from and how much to trust it. */
export interface ElementTime {
  seconds: number;
  method: TimeMethod;
  confidence: Confidence;
  /** Time study id, benchmark reference, MTM analysis — free text. */
  sourceRef?: string;
}

export interface WorkElement {
  id: string;
  name: string;
  /** Capability required to perform it (master data id). */
  capabilityId?: string;
  /** Precedence is a DAG, not a linear routing. */
  predecessors: string[];
  time: ElementTime;
  classification: WorkClass;
  /** Only meaningful when classification is NVA/NNVA. */
  wasteClass?: WasteClass;
  /** 1.0 = the operator is bound for the whole duration; 0 = fully unattended.
   *  This is what makes operator/machine separation and chaku-chaku loops
   *  computable — without it, balancing is wrong for any semi-automated cell. */
  attendedFraction: number;
  skillClass?: string;
  ergonomicLoad: ErgonomicLoad;
  /** Zoning constraints for the balancer. */
  mustBeSameStationAs?: string[];
  mustNotBeSameStationAs?: string[];
  fixedStationId?: string;
}

/**
 * A mix mode — an abstract share of the workload with different work content.
 *
 * Deliberately carries no product identity. Forty part numbers that need the
 * same work are one mode; a mode exists only where work content genuinely
 * differs.
 */
export interface VariantMode {
  id: string;
  name: string;
  /** Share of total output, 0–1. Shares across modes should sum to 1. */
  share: number;
  /** elementId → time multiplier. Absent ⇒ 1.0. Use 0 to skip the element. */
  elementOverrides: Record<string, number>;
}

export const TIME_METHODS: TimeMethod[] = ["MTM", "UAS", "estimate", "benchmarked", "measured"];
export const CONFIDENCES: Confidence[] = ["low", "med", "high"];
export const WORK_CLASSES: WorkClass[] = ["VA", "NNVA", "NVA"];
export const WASTE_CLASSES: WasteClass[] = [
  "transport",
  "motion",
  "waiting",
  "overprocessing",
  "inventory",
  "defects",
  "overproduction",
];
export const ERGONOMIC_LOADS: ErgonomicLoad[] = ["light", "medium", "heavy"];

/** Confidence of a derived number is the weakest of its inputs (spec §9). */
export function weakestConfidence(list: Confidence[]): Confidence {
  if (list.some((c) => c === "low")) return "low";
  if (list.some((c) => c === "med")) return "med";
  return "high";
}

export interface Model {
  /** Bumped by migrations in model/migrate.ts. Absent in legacy/demo files. */
  schemaVersion?: number;
  name: string;
  gridW: number;
  gridH: number;
  /** Default shift length applied when a station omits shiftHours. */
  shiftHours?: number;
  /** Composite-rating weight override. Falls back to engine WEIGHTS when absent. */
  weights?: RatingWeights;
  /** Cost/ROI assumptions (defaults applied in the cost engine). */
  costConfig?: CostConfig;
  stations: Station[];
  flows: Flow[];
  noGoZones: NoGoZone[];
  /** Which manufacturing concept this cell represents (engine/concepts.ts).
   *  Purely descriptive — the rating does not read it. */
  conceptKind?: string;
  /** Product-free workload: what must be done, independent of what is made. */
  workElements?: WorkElement[];
  /** Mix modes for mixed-model balancing. Absent/empty ⇒ single-model. */
  variantModes?: VariantMode[];
}

export const STATION_TYPES: StationType[] = ["machine", "manual", "quality", "store", "buffer"];
export const ROLES: Role[] = ["input", "process", "output"];
export const AUTO: AutoState[] = ["manual", "semi", "auto"];
export const ERGO: ErgoRisk[] = ["low", "med", "high"];
export const TRANSPORT: Transport[] = ["manual", "forklift", "conveyor", "agv"];
export const SIDES: Side[] = ["left", "right", "top", "bottom"];
export const SPLIT_MODES: SplitMode[] = ["distribute", "fork"];
export const MERGE_MODES: MergeMode[] = ["sum", "assemble"];

/** Current schema version. Increment when adding a migration step. */
export const SCHEMA_VERSION = 8;

/** An all-zero breakdown — the starting point when decomposing a station. */
export const EMPTY_CYCLE: CycleBreakdown = {
  valueAddSec: 0,
  handlingSec: 0,
  walkSec: 0,
  waitSec: 0,
  setupSec: 0,
};

/** Default cost assumptions used when costConfig fields are absent. */
export const DEFAULT_COST_CONFIG = {
  laborCostPerHour: 45,
  energyCostPerKwh: 0.15,
  annualShifts: 460,
  currency: "$",
} as const;

/** Default shift length (hours) used by the balance engine when unspecified. */
export const DEFAULT_SHIFT_HOURS = 8;
