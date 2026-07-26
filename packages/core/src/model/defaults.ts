import type { Flow, Model, Station } from "./types";
import { DEFAULT_SHIFT_HOURS, SCHEMA_VERSION, sumCycle } from "./types";

// Field defaults used both when importing partial JSON and when creating new
// stations/flows in-app. Keeps a single source of truth for "what a complete
// record looks like" so import normalization and the editor never drift.

export const STATION_DEFAULTS: Omit<Station, "id"> = {
  name: "New Step",
  role: "process",
  type: "machine",
  x: 0,
  y: 0,
  w: 3,
  h: 2,
  fixed: false,
  auto: "manual",
  autoOverride: null,
  capacityPerShift: 1000,
  operators: 1,
  cycleTimeSec: 30,
  changeoverMin: 10,
  ergoRisk: "low",
  utilities: ["power"],
  notes: "",
  inSide: "left",
  outSide: "right",
  scrapSide: "bottom",
  scrapRate: 0,
  parallelUnits: 1,
  splitMode: "distribute",
  mergeMode: "sum",
  capex: 0,
  automationCapex: 0,
  energyKw: 0,
};

export const FLOW_DEFAULTS: Omit<Flow, "from" | "to"> = {
  volume: 1000,
  unitCost: 0.05,
  transport: "manual",
  partWeightKg: 1,
  notes: "",
};

/** When a station carries a cycle breakdown, the breakdown is authoritative and
 *  cycleTimeSec mirrors its sum. Keeping the legacy scalar in sync means every
 *  existing reader (tooltips, CSV export, AI layout signature) stays correct
 *  without having to know about decomposition. */
export function syncCycleTime(s: Station): Station {
  if (!s.cycle) return s;
  const total = +sumCycle(s.cycle).toFixed(3);
  return s.cycleTimeSec === total ? s : { ...s, cycleTimeSec: total };
}

export function normalizeStation(s: Partial<Station> & { id: string }): Station {
  return syncCycleTime({ ...STATION_DEFAULTS, ...s });
}

export function normalizeFlow(f: Partial<Flow> & { from: string; to: string }): Flow {
  return { ...FLOW_DEFAULTS, ...f };
}

/** Fill a partial/legacy model object with defaults to produce a valid Model. */
export function normalizeModel(o: Partial<Model> & { stations?: unknown; flows?: unknown }): Model {
  const stations = Array.isArray(o.stations) ? (o.stations as Array<Partial<Station> & { id: string }>) : [];
  const flows = Array.isArray(o.flows) ? (o.flows as Array<Partial<Flow> & { from: string; to: string }>) : [];
  return {
    schemaVersion: o.schemaVersion ?? SCHEMA_VERSION,
    name: o.name ?? "Imported",
    gridW: o.gridW ?? 22,
    gridH: o.gridH ?? 14,
    shiftHours: o.shiftHours ?? DEFAULT_SHIFT_HOURS,
    weights: o.weights,
    costConfig: o.costConfig,
    noGoZones: Array.isArray(o.noGoZones) ? o.noGoZones : [],
    stations: stations.map(normalizeStation),
    flows: flows.map(normalizeFlow),
    conceptKind: typeof o.conceptKind === "string" ? o.conceptKind : undefined,
    workElements: Array.isArray(o.workElements) ? o.workElements : undefined,
    variantModes: Array.isArray(o.variantModes) ? o.variantModes : undefined,
  };
}
