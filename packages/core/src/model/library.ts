import type { ErgonomicLoad, Model, Station, StationType, WasteClass, WorkClass } from "./types";
import { STATION_DEFAULTS } from "./defaults";
import { CAPABILITY_HINTS } from "../engine/infer";
import { newStationId } from "../store/reducer";

/**
 * The process library — the steps a plant knows how to do.
 *
 * Until now the only catalog of process knowledge in the app was
 * `CAPABILITY_HINTS`, buried in the inference engine: a planner typed "Leak
 * test 25" into a routing and the tool silently matched a keyword to decide it
 * was `test.function`, NNVA, 40% attended. That catalog was invisible,
 * uneditable, and 12 entries long forever — a plant's actual process knowledge
 * had nowhere to live, so every routing and every station was retyped from
 * memory each time.
 *
 * This is that catalog, promoted to something a planner owns: named, editable,
 * extendable, and picked from rather than guessed at. Inference stays exactly
 * as it was — it is what still handles a step the library has no entry for.
 *
 * A library entry is deliberately not a Station. A station has a position, a
 * size, edges and neighbours; a library entry is only the part that travels
 * between cells — what the step is, how long it takes, how much of that binds
 * an operator, and what it costs to own.
 */
export interface LibraryProcess {
  id: string;
  /** What a planner calls it. Used verbatim as a step and station name. */
  name: string;
  /** The engine capability this maps to, so inference and the library agree. */
  capabilityId: string;
  cycleTimeSec: number;
  classification: WorkClass;
  wasteClass?: WasteClass;
  /** Fraction of the cycle that binds an operator, 0–1. */
  attendedFraction: number;
  ergonomicLoad: ErgonomicLoad;
  /** What kind of station this becomes on the canvas. */
  type: StationType;
  changeoverMin: number;
  /** One-time cost of owning the equipment. */
  capex: number;
  /** Average draw in kW while running. */
  energyKw: number;
  notes: string;
  /** Seeded from the engine catalog rather than added by the planner. Seeded
   *  entries are editable and deletable like any other; the flag only drives
   *  "restore the seeded steps". */
  seeded?: boolean;
}

/** A capability's category decides what the step looks like on the canvas. */
const TYPE_OF_CATEGORY: Record<string, StationType> = {
  cut: "machine",
  form: "machine",
  join: "machine",
  surface: "machine",
  mark: "machine",
  inspect: "quality",
  test: "quality",
  handle: "manual",
  transport: "manual",
};

/**
 * The starting library, derived from the engine's capability catalog.
 *
 * Derived rather than hand-written so the two cannot disagree: every
 * capability inference can produce has a library entry a planner can pick,
 * carrying the same seconds and the same classification.
 */
export const SEED_LIBRARY: LibraryProcess[] = CAPABILITY_HINTS.map((h) => ({
  id: "lib_" + h.capabilityId,
  name: h.label,
  capabilityId: h.capabilityId,
  cycleTimeSec: h.defaultSeconds,
  classification: h.classification,
  wasteClass: h.wasteClass,
  attendedFraction: h.attendedFraction,
  ergonomicLoad: h.ergonomicLoad,
  type: TYPE_OF_CATEGORY[h.category] ?? "machine",
  changeoverMin: 0,
  capex: 0,
  energyKw: 0,
  notes: "",
  seeded: true,
}));

/** An empty entry for the planner to fill in. */
export function blankProcess(id: string): LibraryProcess {
  return {
    id,
    name: "New process",
    capabilityId: "unknown",
    cycleTimeSec: 30,
    classification: "VA",
    attendedFraction: 1,
    ergonomicLoad: "medium",
    type: "machine",
    changeoverMin: 0,
    capex: 0,
    energyKw: 0,
    notes: "",
  };
}

/**
 * A station carrying this process's numbers, ready to place.
 *
 * "Add process step" used to hand back `makeStation` — "New Step", machine,
 * 30s, one operator, every time — so the first thing anyone did after adding a
 * step was retype all of it.
 */
export function stationFromProcess(model: Model, p: LibraryProcess): Station {
  return {
    ...STATION_DEFAULTS,
    id: newStationId(model),
    x: Math.floor(model.gridW / 2 - 1),
    y: Math.floor(model.gridH / 2 - 1),
    name: p.name,
    type: p.type,
    cycleTimeSec: p.cycleTimeSec,
    changeoverMin: p.changeoverMin,
    // An unattended step still occupies its machine, but nobody stands at it.
    operators: p.attendedFraction > 0 ? 1 : 0,
    auto: p.attendedFraction >= 1 ? "manual" : p.attendedFraction > 0 ? "semi" : "auto",
    ergoRisk: p.ergonomicLoad === "heavy" ? "high" : p.ergonomicLoad === "medium" ? "med" : "low",
    capex: p.capex,
    energyKw: p.energyKw,
    notes: p.notes,
  };
}

/** One step of a routing, in the form the parts matrix writes. */
export function routingStep(p: LibraryProcess): string {
  return `${p.name} ${p.cycleTimeSec}`;
}
