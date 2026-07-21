// FlowPlan canonical data model. Mirrors spec §3 and the demo's JSON shape.
// The whole layout is a single Model object; Export produces exactly this and
// Import fills missing fields with defaults (see model/defaults.ts).

import type { Capability } from "./capabilities";

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

/** Provenance of a single stored number (spec §5, fixes Excel failure F8 —
 *  "no confidence signal"). Rendered always-visible: `estimated` draws as a
 *  hatched range, the firmer two as a point. A number's confidence must be
 *  assigned when it enters the model, never inferred at render. */
export type DataQuality = "measured" | "benchmarked" | "estimated";
export const DATA_QUALITIES: DataQuality[] = ["measured", "benchmarked", "estimated"];

/** Station numeric fields that carry a data-quality flag — the ones investment
 *  follows, where false precision is expensive. */
export type StationDataField = "cycleTimeSec" | "capex" | "energyKw" | "capacityPerShift" | "changeoverMin";
export const STATION_DATA_FIELDS: StationDataField[] = [
  "cycleTimeSec",
  "capex",
  "energyKw",
  "capacityPerShift",
  "changeoverMin",
];

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
  /** Parts processed together in ONE cycle — a multi-cavity die, a fixture that
   *  holds several parts, a batch oven. Multiplies the step's part throughput
   *  without adding a machine (unlike parallelUnits): its per-part time is the
   *  cycle divided by this. Default 1. */
  partsPerCycle?: number;
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
  /** WIP a FLOW FUNCTION (buffer / store) can hold, in pieces. A buffer decouples
   *  its neighbours by absorbing this much inventory; it is not a work step, so it
   *  never contributes cycle time, takt, balance or operators. Absent ⇒ 0. */
  bufferCapacity?: number;
  /** Capability ids this resource provides (spec §3.4). Drives gate 1 coverage:
   *  a cell needs capabilities, resources provide them, and it is the N:M
   *  relation that generates alternatives. Absent ⇒ provides nothing declared. */
  provides?: string[];
  /** Annual volume band this resource is validated for (spec §3.4, gate 2). */
  volumeBand?: { minUnitsPerYear: number; maxUnitsPerYear: number };
  /** Per-field provenance for this station's numbers (spec §5). Sparse: a
   *  missing entry is treated as "estimated" at render, so an unmarked number
   *  reads as suspect rather than firm. Assigned at model entry, not at render. */
  dataQuality?: Partial<Record<StationDataField, DataQuality>>;
  /** Keep-clear access margins around the footprint, in grid cells per side
   *  (spec §12 access_clearance / §14 clearance). The space an operator or
   *  maintenance needs, and an aisle must not be blocked by another machine's
   *  body. Absent ⇒ no declared clearance. A first, grid-aligned increment
   *  toward a real envelope (audit C-03); true machine-relative access is a
   *  later refinement. */
  clearance?: Clearance;
  /** Equipment weight in kg (spec §12 floor_load). With a cell's floor-load
   *  capacity it flags a station too heavy for the slab. Absent ⇒ not checked. */
  weightKg?: number;
  /** Fraction of the station's cycle that binds an operator (0–1), the
   *  station-level analogue of WorkElement.attendedFraction (spec §11, audit
   *  A-06/C-13). 1 = fully manual; a machine that only needs load/unload is low.
   *  Absent ⇒ a type default (manual 1, quality 0.6, machine 0.3, flow 0). Drives
   *  operator-loop work content and multi-machine tending. */
  attendedFraction?: number;
  /** Id of the operator loop that tends this station (spec §13, audit C-13).
   *  Stations sharing an operatorId are one walking loop (chaku-chaku / multi-
   *  machine tending); walk time between them is computed from the layout.
   *  Absent ⇒ not assigned to an explicit loop. */
  operatorId?: string;
  /** Equipment availability 0–1 (spec §12 reliability, audit C-02): the uptime
   *  fraction that scales the station's effective throughput. Absent ⇒ derived
   *  from mtbf/mttr if given, else 1 (perfectly available). */
  availabilityPct?: number;
  /** Mean time between failures / to repair, hours (spec §12 reliability). When
   *  both are given, availability = MTBF ÷ (MTBF + MTTR). */
  mtbfHours?: number;
  mttrHours?: number;
}

/** Grid-aligned keep-clear margins around a station footprint, in cells. */
export interface Clearance {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Cost assumptions for the ROI model. Informational — not in the composite. */
export interface CostConfig {
  laborCostPerHour?: number;
  energyCostPerKwh?: number;
  annualShifts?: number;
  currency?: string;
  /** Physical area of one grid cell, m². Lets floor space report in m² instead
   *  of abstract grid cells. Absent ⇒ figures are in grid cells. */
  cellAreaM2?: number;
  /** Extra floor for bins and replenishment, as a fraction of the cell area.
   *  The blueprint's "forgotten 30-40 %". Absent ⇒ DEFAULT_MATERIAL_SUPPLY_FACTOR. */
  materialSupplyFactor?: number;
  /** Annual occupancy cost per m² of floor (rent, utilities, overhead). Floor
   *  space was measured but never charged (audit C-08); this turns it into an
   *  opex line. Absent ⇒ DEFAULT_COST_CONFIG.spaceCostPerM2Year. */
  spaceCostPerM2Year?: number;
  /** Annual maintenance/MRO + tooling as a fraction of equipment capex — the
   *  standard estimate when a detailed tooling model is absent (audit C-08).
   *  Absent ⇒ DEFAULT_COST_CONFIG.maintenancePctOfCapexPerYear. */
  maintenancePctOfCapexPerYear?: number;
}

/** The four separated material paths (blueprint §09/§10). The separation itself
 *  is the guardrail: a reject must not be able to leave on the good-part route,
 *  ensured by geometry, not by a work instruction. Absent ⇒ "good". */
export type FlowKind = "good" | "nok" | "rwk";
export const FLOW_KINDS: FlowKind[] = ["good", "nok", "rwk"];

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
  /** Which of the four material paths this flow is. Absent ⇒ good part. */
  kind?: FlowKind;
}

/** Non-station canvas elements. `blocking`/`wall`/`column` are obstacles the
 *  placement engine must avoid; `spacer`/`aisle`/`esd` are reserved space that
 *  does not block placement but is reported in the floor-space split. Absent
 *  kind ⇒ "blocking", so a legacy no-go zone stays an obstacle. */
export type ZoneKind = "blocking" | "spacer" | "aisle" | "wall" | "column" | "esd";
export const ZONE_KINDS: ZoneKind[] = ["blocking", "spacer", "aisle", "wall", "column", "esd"];
/** Kinds the placement engine treats as an obstacle. */
export const BLOCKING_ZONE_KINDS: ZoneKind[] = ["blocking", "wall", "column"];

export interface NoGoZone {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** What kind of reserved/blocked space this is. Absent ⇒ "blocking". */
  kind?: ZoneKind;
  /** Envelope obstacle attributes (spec §14, audit C-03 inc2). `movable` marks
   *  an obstacle that could be relocated at a cost; `moveCost` is that cost in
   *  cost units. Absent ⇒ a fixed obstacle (a column, a wall). */
  movable?: boolean;
  moveCost?: number;
}

/** A documentation annotation (Node-RED "group"): a labelled, commented box drawn
 *  around a set of machines. Purely informational — it never blocks placement,
 *  affects the flow or enters the rating; it exists to document the layout. */
export interface Group {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Short title shown on the box. */
  label: string;
  /** Longer note shown under the title for documentation. */
  comment?: string;
  /** One of the data-encoding accent colours (index into a small palette). */
  color?: number;
}

/** True when a zone blocks station placement (vs. merely reserving floor). */
export function isBlockingZone(z: NoGoZone): boolean {
  return BLOCKING_ZONE_KINDS.includes(z.kind ?? "blocking");
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
  /** Fraction of parts scrapped performing this element (0–1). Absent ⇒ 0.
   *  A station inherits the max scrap of the elements assigned to it. */
  scrapRate?: number;
  /** Parts processed together in one cycle (a multi-cavity op). Absent ⇒ 1.
   *  Its per-part time for balancing is the element time divided by this. */
  partsPerCycle?: number;
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

/** The confidence a per-field data quality propagates as, so a derived number
 *  (TCO, station-count, throughput) can take the weakest of its inputs (§5).
 *  measured → high, benchmarked → med, estimated → low. */
export function qualityConfidence(q: DataQuality): Confidence {
  return q === "measured" ? "high" : q === "benchmarked" ? "med" : "low";
}

/** Data quality of a station field, defaulting to "estimated" when unmarked —
 *  an unmarked number is suspect, not firm (spec §5). */
export function fieldQuality(s: Station, field: StationDataField): DataQuality {
  return s.dataQuality?.[field] ?? "estimated";
}

/** Confidence a station propagates, taken as the weakest across its marked
 *  numeric fields (§5). Used when a derived figure is built from the station. */
export function stationConfidence(s: Station, fields: StationDataField[] = STATION_DATA_FIELDS): Confidence {
  return weakestConfidence(fields.map((f) => qualityConfidence(fieldQuality(s, f))));
}

/** Demand over a program horizon plus the shift model (PAUL Demands + Capa MA).
 *  Drives capacity: machines needed per year, operators per year. Independent of
 *  the layout — a cell can be evaluated against several years of demand. */
export interface DemandYear {
  year: number;
  /** Units required that year (already includes any flex volume). */
  units: number;
}
export interface Demand {
  years: DemandYear[];
  /** Shifts per working day. */
  shiftsPerDay?: number;
  /** Hours of production per shift. */
  hoursPerShift?: number;
  /** Working days per year. */
  workingDaysPerYear?: number;
  /** Overall effectiveness (OEE), 0–1, applied to available time. */
  oee?: number;
}

/** Default shift model when a Demand omits fields (one 8 h shift, 220 days, 85 % OEE). */
export const DEFAULT_SHIFT_MODEL = {
  shiftsPerDay: 1,
  hoursPerShift: 8,
  workingDaysPerYear: 220,
  oee: 0.85,
} as const;

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
  /** Balancing loss factor (spec / IE blueprint). Carries walking, reaching,
   *  handling and balancing loss — none of which appears in a standard time —
   *  so the calculated station count is (work content ÷ takt) × lossFactor.
   *  Stored as a constant so it is neither measured nor forgotten. Absent ⇒
   *  DEFAULT_LOSS_FACTOR. */
  lossFactor?: number;
  /** Which manufacturing concept this cell represents (engine/concepts.ts).
   *  Purely descriptive — the rating does not read it. */
  conceptKind?: string;
  /** Multi-year demand + shift model, for capacity analysis (PAUL Capa MA/HC). */
  demand?: Demand;
  /** Floor slab load capacity in kg/m² (spec §12/§14 envelope, audit C-03).
   *  A station whose weight ÷ footprint area exceeds this is flagged. Absent ⇒
   *  the floor-load check is skipped (no false positives on legacy models). */
  floorLoadKgPerM2?: number;
  /** Minimum aisle / egress width in grid cells (audit C-03). Used to check
   *  that every station keeps a walkable path to the floor boundary. Absent ⇒
   *  DEFAULT_AISLE_WIDTH is used only when a clearance/egress check runs. */
  aisleWidth?: number;
  /** Usable floor outline as a closed polygon of grid points (spec §14 envelope,
   *  audit C-03 inc2). Lets the floor be a non-rectangular shape: a station whose
   *  footprint leaves the polygon is flagged and the optimiser won't move one
   *  out. Absent ⇒ the full grid rectangle is usable. */
  floorPolygon?: Array<[number, number]>;
  /** Operator walking speed in m/s, for operator-loop walk time (spec §13, audit
   *  C-13). Absent ⇒ DEFAULT_WALK_SPEED_MPS. */
  walkSpeedMps?: number;
  /** Governed capability catalog for this cell (spec §12, audit C-01). Absent ⇒
   *  the seeded DEFAULT_CAPABILITIES are used, so coverage works offline. */
  capabilities?: Capability[];
  /** Product-free workload: what must be done, independent of what is made. */
  workElements?: WorkElement[];
  /** Mix modes for mixed-model balancing. Absent/empty ⇒ single-model. */
  variantModes?: VariantMode[];
  /** Documentation annotations — labelled/commented boxes around machines. Purely
   *  informational; they never affect placement, flow or the rating. Absent ⇒ none. */
  groups?: Group[];
}

export const STATION_TYPES: StationType[] = ["machine", "manual", "quality", "store", "buffer"];
export const ROLES: Role[] = ["input", "process", "output"];

/** Types that hold material rather than process it — a buffer or a store. A flow
 *  function is part of the material flow (it sits in the graph, holds WIP, takes
 *  floor space) but is NOT a work step: it contributes no cycle time, takt,
 *  balance or operator load. `store` covers the input/output staging areas too. */
export function isFlowFunction(s: Pick<Station, "type">): boolean {
  return s.type === "buffer" || s.type === "store";
}

/** Parts processed together in one cycle (≥1). A multi-part step outputs this
 *  many parts per cycle, so its per-part time is the cycle divided by it. */
export function partsPerCycleOf(s: Pick<Station, "partsPerCycle">): number {
  return Math.max(1, Math.floor(s.partsPerCycle ?? 1));
}
export const AUTO: AutoState[] = ["manual", "semi", "auto"];
export const ERGO: ErgoRisk[] = ["low", "med", "high"];
export const TRANSPORT: Transport[] = ["manual", "forklift", "conveyor", "agv"];
export const SIDES: Side[] = ["left", "right", "top", "bottom"];
export const SPLIT_MODES: SplitMode[] = ["distribute", "fork"];
export const MERGE_MODES: MergeMode[] = ["sum", "assemble"];

/** Current schema version. Increment when adding a migration step. */
export const SCHEMA_VERSION = 17;

/** Default minimum aisle / egress width in cells when a model omits it but a
 *  clearance/egress check runs (audit C-03). One metre = one cell. */
export const DEFAULT_AISLE_WIDTH = 1;

/** Default operator walking speed, m/s (audit C-13). A conservative shop-floor
 *  pace with turns and reaches — slower than the ~1.4 m/s open-corridor figure. */
export const DEFAULT_WALK_SPEED_MPS = 1.0;

/** Equipment availability of a station, 0–1 (audit C-02). Prefers MTBF/MTTR
 *  when both are given (availability = MTBF ÷ (MTBF + MTTR)), else the direct
 *  availabilityPct, else 1. Scales effective throughput so an unreliable machine
 *  becomes a capacity constraint. */
export function availabilityOf(s: Pick<Station, "availabilityPct" | "mtbfHours" | "mttrHours">): number {
  const mtbf = s.mtbfHours;
  const mttr = s.mttrHours;
  if (typeof mtbf === "number" && mtbf > 0 && typeof mttr === "number" && mttr >= 0 && mtbf + mttr > 0) {
    return Math.max(0, Math.min(1, mtbf / (mtbf + mttr)));
  }
  const a = s.availabilityPct;
  return typeof a === "number" && isFinite(a) ? Math.max(0, Math.min(1, a)) : 1;
}

/** Type defaults for the operator-bound share of a station's cycle when it does
 *  not declare one (audit A-06/C-13): manual work fully binds an operator, a
 *  machine only for load/unload, a flow function not at all. */
export function attendedFractionOf(s: Pick<Station, "type" | "attendedFraction">): number {
  if (typeof s.attendedFraction === "number" && isFinite(s.attendedFraction)) {
    return Math.max(0, Math.min(1, s.attendedFraction));
  }
  if (isFlowFunction(s as Pick<Station, "type">)) return 0;
  switch (s.type) {
    case "manual":
      return 1;
    case "quality":
      return 0.6;
    case "machine":
      return 0.3;
    default:
      return 0.5;
  }
}

/** An all-zero breakdown — the starting point when decomposing a station. */
export const EMPTY_CYCLE: CycleBreakdown = {
  valueAddSec: 0,
  handlingSec: 0,
  walkSec: 0,
  waitSec: 0,
  setupSec: 0,
};

/** Extra floor for bins and replenishment as a fraction of cell area — the
 *  blueprint's "forgotten 30-40 %". 0.35 is the midpoint. */
export const DEFAULT_MATERIAL_SUPPLY_FACTOR = 0.35;

/** Physical edge length of one grid cell, in metres. One cell is a 1 m × 1 m
 *  square, so a cell is 1 m² of floor and a unit of travel distance is 1 m.
 *  This is the canonical scale the whole tool measures space in. */
export const CELL_SIZE_M = 1;
/** Floor area of one grid cell, m² (CELL_SIZE_M²). */
export const CELL_AREA_M2 = CELL_SIZE_M * CELL_SIZE_M;

/** Default cost assumptions used when costConfig fields are absent. */
export const DEFAULT_COST_CONFIG = {
  laborCostPerHour: 45,
  energyCostPerKwh: 0.15,
  annualShifts: 460,
  currency: "$",
  materialSupplyFactor: DEFAULT_MATERIAL_SUPPLY_FACTOR,
  // One cell = 1 m × 1 m, so floor space and travel report in real metres.
  cellAreaM2: CELL_AREA_M2,
  // Occupancy cost per m²·year — a mid-range industrial figure so floor space
  // finally shows up in cost per part (audit C-08).
  spaceCostPerM2Year: 150,
  // Maintenance/MRO + tooling as a fraction of capex per year — the standard
  // planning estimate when no detailed tooling model exists (audit C-08).
  maintenancePctOfCapexPerYear: 0.05,
} as const;

/** Default shift length (hours) used by the balance engine when unspecified. */
export const DEFAULT_SHIFT_HOURS = 8;

/** Default balancing loss factor. 1.2 is the IE-standard midpoint of the band
 *  below — enough to carry walking/reaching/handling/balancing loss without a
 *  measurement campaign. */
export const DEFAULT_LOSS_FACTOR = 1.2;

/** The documented band a loss factor should sit in. Shown in the UI so the
 *  number reads as a chosen constant with provenance, not a free tuning knob. */
export const LOSS_FACTOR_BAND: readonly [number, number] = [1.15, 1.25];

/** A model's loss factor, clamped to sane bounds, defaulting when unset. */
export function lossFactorOf(model: { lossFactor?: number }): number {
  const v = model.lossFactor;
  return typeof v === "number" && isFinite(v) && v > 0 ? Math.max(1, Math.min(2, v)) : DEFAULT_LOSS_FACTOR;
}
