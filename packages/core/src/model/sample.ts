import type { Model } from "./types";
import { DEFAULT_SHIFT_HOURS, SCHEMA_VERSION } from "./types";

// Demo cell ported verbatim from flowplan6.html so the golden-fixture tests can
// lock the rating/balance numbers against the original.
export const SAMPLE: Model = {
  schemaVersion: SCHEMA_VERSION,
  name: "Cell A — Hydrobuchse line (demo)",
  gridW: 22,
  gridH: 14,
  shiftHours: DEFAULT_SHIFT_HOURS,
  stations: [
    { id: "raw", name: "Raw Material", role: "input", type: "store", x: 1, y: 6, w: 3, h: 2, fixed: true, auto: "manual", autoOverride: null, capacityPerShift: 2000, operators: 0, cycleTimeSec: 0, utilities: [], ergoRisk: "low", changeoverMin: 0, notes: "Inbound staging" },
    { id: "cnc", name: "CNC Turning", role: "process", type: "machine", x: 6, y: 2, w: 3, h: 3, fixed: false, auto: "auto", autoOverride: null, capacityPerShift: 1300, operators: 1, cycleTimeSec: 42, utilities: ["power", "air", "coolant"], ergoRisk: "low", changeoverMin: 25, notes: "Siemens S7 controlled", dataQuality: { cycleTimeSec: "measured", changeoverMin: "measured" } },
    { id: "press", name: "Press", role: "process", type: "machine", x: 11, y: 2, w: 4, h: 3, fixed: true, auto: "semi", autoOverride: null, capacityPerShift: 1250, operators: 1, cycleTimeSec: 38, utilities: ["power", "hydraulic"], ergoRisk: "med", changeoverMin: 40, notes: "Anchored — foundation pit", dataQuality: { cycleTimeSec: "measured" } },
    { id: "assembly", name: "Assembly", role: "process", type: "manual", x: 11, y: 9, w: 3, h: 3, fixed: false, auto: "manual", autoOverride: null, capacityPerShift: 1150, operators: 3, cycleTimeSec: 95, utilities: ["power", "air"], ergoRisk: "high", changeoverMin: 10, notes: "Manual workstation, 3 operators", dataQuality: { cycleTimeSec: "estimated" } },
    { id: "qa", name: "QA / Inspection", role: "process", type: "quality", x: 6, y: 9, w: 3, h: 2, fixed: false, auto: "semi", autoOverride: null, capacityPerShift: 1200, operators: 1, cycleTimeSec: 30, utilities: ["power"], ergoRisk: "low", changeoverMin: 5, notes: "nLine surface inspection", dataQuality: { cycleTimeSec: "benchmarked" } },
    { id: "ship", name: "Shipping", role: "output", type: "store", x: 18, y: 6, w: 3, h: 2, fixed: true, auto: "manual", autoOverride: null, capacityPerShift: 2000, operators: 1, cycleTimeSec: 0, utilities: [], ergoRisk: "low", changeoverMin: 0, notes: "Outbound dock" },
  ],
  flows: [
    { from: "raw", to: "cnc", volume: 1200, unitCost: 0.05, transport: "forklift", partWeightKg: 2.4, notes: "" },
    { from: "cnc", to: "press", volume: 1200, unitCost: 0.05, transport: "forklift", partWeightKg: 2.4, notes: "" },
    { from: "press", to: "assembly", volume: 1150, unitCost: 0.04, transport: "conveyor", partWeightKg: 2.1, notes: "" },
    { from: "assembly", to: "qa", volume: 1100, unitCost: 0.06, transport: "manual", partWeightKg: 2.1, notes: "" },
    { from: "qa", to: "ship", volume: 1050, unitCost: 0.05, transport: "forklift", partWeightKg: 2.1, notes: "" },
  ],
  noGoZones: [],
};

/** A minimal blank model for "Start blank" onboarding. */
export function blankModel(): Model {
  return {
    schemaVersion: SCHEMA_VERSION,
    name: "Untitled cell",
    gridW: 22,
    gridH: 14,
    shiftHours: DEFAULT_SHIFT_HOURS,
    stations: [],
    flows: [],
    noGoZones: [],
  };
}
