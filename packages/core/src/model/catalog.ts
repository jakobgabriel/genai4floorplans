import type { DataQuality, StationType } from "./types";

// Process library — a catalog of standard processes / building blocks (PAUL
// "Catalog" tab + the blueprint's "standard building blocks"). The standard does
// not invent cells: it combines released building blocks with known
// characteristics and defined interfaces, and that is what makes cells
// combinable. A cell is authored by dropping catalog entries onto the canvas.
//
// Deliberate divergence from PAUL: a process does NOT link 1:1 to a workcenter.
// An entry declares the *capability* it provides; resources that provide that
// capability are matched N:M, because the N:M relation is what generates
// alternatives (governing spec §7). A 1:1 link makes the tool a recorder, not a
// generator.

export type ProcessCategory = "metal" | "rubber" | "plastic" | "assembly" | "test" | "logistics";
export const PROCESS_CATEGORIES: ProcessCategory[] = ["metal", "rubber", "plastic", "assembly", "test", "logistics"];

export type Robustness = "low" | "med" | "high";

/** A standard process the library offers. Fields mirror the PAUL catalog
 *  (standard cycle time, robustness, tariffs surrogate, space, tooling, machine
 *  invest, process id) plus the blueprint's building-block idea. */
export interface ProcessCatalogEntry {
  id: string;
  /** Human name shown in the library and palette. */
  name: string;
  category: ProcessCategory;
  /** The station type instantiated when this entry is placed. */
  stationType: StationType;
  /** Capability this process provides (N:M to resources — never a 1:1 workcenter). */
  capability?: string;
  /** Standard cycle time (seconds) and how firm that standard is. */
  cycleTimeSec: number;
  dataQuality?: DataQuality;
  /** Changeover / setup time (minutes). */
  setupMin?: number;
  /** How process-robust this standard is (drives risk, not the grade). */
  robustness?: Robustness;
  /** Fraction of cycle that binds an operator; the rest is unattended machine
   *  time (ties to the balancer's attendedFraction). 1 = fully manual. */
  attendedFraction?: number;
  /** Footprint guide as grid cells (width × height). */
  w?: number;
  h?: number;
  /** Standard tooling cost and machine investment (cost units). */
  toolingCost?: number;
  machineInvest?: number;
  /** PE process-identification number, if governed. */
  processId?: string;
  notes?: string;
  /** True for user-authored (non-predefined) entries. Absent ⇒ a seed building
   *  block. Lets "Reset to seed" and the documentation view distinguish the two. */
  custom?: boolean;
}

/** Seed library — illustrative standard building blocks drawn from the two IE
 *  source documents. Users extend it; entries persist in the library store. */
export const DEFAULT_CATALOG: ProcessCatalogEntry[] = [
  { id: "cat-cnc-turn", name: "CNC turning", category: "metal", stationType: "machine", capability: "turning", cycleTimeSec: 42, dataQuality: "measured", setupMin: 25, robustness: "high", attendedFraction: 0.3, w: 3, h: 3, machineInvest: 180000, processId: "10105000", notes: "Siemens S7 class turning centre." },
  { id: "cat-press", name: "Press (join)", category: "metal", stationType: "machine", capability: "pressing", cycleTimeSec: 38, dataQuality: "measured", setupMin: 40, robustness: "high", attendedFraction: 0.4, w: 4, h: 3, machineInvest: 150000, notes: "Hydraulic press, foundation-mounted." },
  { id: "cat-screw", name: "Screwdriving (torque-monitored)", category: "assembly", stationType: "machine", capability: "screwdriving", cycleTimeSec: 18, dataQuality: "benchmarked", setupMin: 5, robustness: "high", attendedFraction: 0.5, w: 2, h: 2, machineInvest: 45000, notes: "Standard type SR-2, torque monitoring." },
  { id: "cat-manual-assy", name: "Manual assembly workplace", category: "assembly", stationType: "manual", capability: "assembly", cycleTimeSec: 60, dataQuality: "estimated", setupMin: 10, robustness: "med", attendedFraction: 1, w: 3, h: 2, notes: "Manual workplace kit, grid 1500×800 mm." },
  { id: "cat-leak-test", name: "Leak test rig (autonomous)", category: "test", stationType: "quality", capability: "leaktest", cycleTimeSec: 90, dataQuality: "measured", setupMin: 5, robustness: "high", attendedFraction: 0.17, w: 3, h: 2, machineInvest: 80000, notes: "DP-40, runs autonomously; operator only loads/unloads." },
  { id: "cat-fct", name: "Electrical function test", category: "test", stationType: "quality", capability: "fct", cycleTimeSec: 45, dataQuality: "estimated", setupMin: 5, robustness: "med", attendedFraction: 0.3, w: 2, h: 2, machineInvest: 60000 },
  { id: "cat-laser", name: "Laser type plate (DMC)", category: "assembly", stationType: "machine", capability: "marking", cycleTimeSec: 20, dataQuality: "measured", setupMin: 2, robustness: "high", attendedFraction: 0.2, w: 2, h: 2, machineInvest: 55000 },
  { id: "cat-wash", name: "Parts washing", category: "metal", stationType: "machine", capability: "washing", cycleTimeSec: 90, dataQuality: "benchmarked", setupMin: 10, robustness: "med", attendedFraction: 0.1, w: 3, h: 2, machineInvest: 70000 },
  { id: "cat-deburr", name: "Deburring", category: "metal", stationType: "machine", capability: "deburring", cycleTimeSec: 30, dataQuality: "estimated", setupMin: 10, robustness: "med", attendedFraction: 0.6, w: 2, h: 2, machineInvest: 40000 },
  { id: "cat-vulc", name: "Rubber vulcanising", category: "rubber", stationType: "machine", capability: "vulcanising", cycleTimeSec: 120, dataQuality: "benchmarked", setupMin: 30, robustness: "med", attendedFraction: 0.15, w: 3, h: 3, machineInvest: 130000 },
  { id: "cat-mould", name: "Injection moulding", category: "plastic", stationType: "machine", capability: "moulding", cycleTimeSec: 45, dataQuality: "benchmarked", setupMin: 45, robustness: "high", attendedFraction: 0.1, w: 4, h: 3, machineInvest: 200000 },
  { id: "cat-kit", name: "Order kitting / supermarket", category: "logistics", stationType: "store", capability: "kitting", cycleTimeSec: 0, dataQuality: "estimated", setupMin: 0, robustness: "med", attendedFraction: 1, w: 3, h: 2, notes: "Picked order kit, not stocked at the bench." },
];

/** The partial-station patch a catalog entry contributes when placed. The web
 *  layer merges this over station defaults (keeping the engine framework-free).
 *  `provides` carries the capability; there is intentionally no workcenter. */
export function catalogStationPatch(e: ProcessCatalogEntry): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    name: e.name,
    role: "process",
    type: e.stationType,
    cycleTimeSec: e.cycleTimeSec,
    changeoverMin: e.setupMin ?? 0,
    w: e.w ?? 3,
    h: e.h ?? 2,
  };
  if (e.capability) patch.provides = [e.capability];
  if (e.machineInvest) patch.capex = e.machineInvest;
  if (e.dataQuality) patch.dataQuality = { cycleTimeSec: e.dataQuality };
  return patch;
}
