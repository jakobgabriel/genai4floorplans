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
}

export interface Flow {
  from: string;
  to: string;
  volume: number;
  unitCost: number;
  transport: Transport;
  partWeightKg: number;
  notes: string;
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
  stations: Station[];
  flows: Flow[];
  noGoZones: NoGoZone[];
}

export const STATION_TYPES: StationType[] = ["machine", "manual", "quality", "store", "buffer"];
export const ROLES: Role[] = ["input", "process", "output"];
export const AUTO: AutoState[] = ["manual", "semi", "auto"];
export const ERGO: ErgoRisk[] = ["low", "med", "high"];
export const TRANSPORT: Transport[] = ["manual", "forklift", "conveyor", "agv"];
export const SIDES: Side[] = ["left", "right", "top", "bottom"];

/** Current schema version. Increment when adding a migration step. */
export const SCHEMA_VERSION = 3;

/** Default shift length (hours) used by the balance engine when unspecified. */
export const DEFAULT_SHIFT_HOURS = 8;
