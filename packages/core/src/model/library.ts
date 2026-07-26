import type {
  AutoState,
  ErgoRisk,
  Model,
  Role,
  Station,
  StationType,
  WasteClass,
  WorkClass,
} from "./types";
import { STATION_DEFAULTS } from "./defaults";
import { matchHint } from "../engine/infer";
import { newStationId } from "../store/reducer";
import type { ProcessStep } from "../engine/generate";

/**
 * The process library — the steps a plant knows how to do.
 *
 * Until this existed, the only catalog of process knowledge was
 * `CAPABILITY_HINTS`, buried in the inference engine: you typed "Leak test 25"
 * into a routing and a keyword match silently decided it was `test.function`,
 * NNVA, 40% attended. Invisible, uneditable, and the same twelve entries for
 * everybody. A plant's own process knowledge had nowhere to live, so every
 * routing and every station was retyped from memory.
 *
 * Two halves, deliberately:
 *
 *   the core      the fields the engines consume. Fixed, typed, and complete —
 *                 everything a station carries that belongs to the *process*
 *                 rather than to its position in one particular cell.
 *   the extension free-form fields the planner adds. Tool number, supplier,
 *                 programme name, NC file, whatever this plant tracks. The
 *                 tool never reads these; it stores them, shows them, and
 *                 carries them onto the stations placed from the entry.
 *
 * The split matters because the first half cannot grow without engine work and
 * the second half must be able to grow without asking anyone.
 *
 * There is no seed data. A library shipped full of somebody else's twelve
 * generic processes is a library nobody curates — you cannot tell your own
 * entries from the furniture, and deleting the furniture is the first chore.
 * It starts empty, and `fromCapabilities` is offered as an explicit import for
 * anyone who wants the inference catalog as a starting point.
 */

/** One planner-defined field on a process. The tool stores and shows it only. */
export interface CustomField {
  id: string;
  label: string;
  value: string;
}

/** A label a process can carry. Processes carry any number of them. */
export interface LibraryTag {
  id: string;
  name: string;
  /** Carbon tag palette name, so a category reads at a glance. */
  color: TagColor;
}

export const TAG_COLORS = ["gray", "blue", "green", "teal", "purple", "magenta", "red", "cyan"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export interface LibraryProcess {
  id: string;
  /** What a planner calls it. Used verbatim as a step and station name. */
  name: string;
  /** Tag ids. A process is in as many categories as it belongs to — which is
   *  why this is tagging and not a single `category` field: "Weld" is both a
   *  joining operation and a fume-extraction consumer, and one taxonomy cannot
   *  hold both without duplicating the entry. */
  tags: string[];

  // ---- what the step is -------------------------------------------------
  /** The engine capability, so inference and the library agree. */
  capabilityId: string;
  role: Role;
  type: StationType;
  auto: AutoState;

  // ---- what it takes ----------------------------------------------------
  cycleTimeSec: number;
  /** Fraction of the cycle that binds an operator, 0–1. */
  attendedFraction: number;
  operators: number;
  changeoverMin: number;
  classification: WorkClass;
  wasteClass?: WasteClass;
  ergoRisk: ErgoRisk;

  // ---- what it costs and occupies ---------------------------------------
  capex: number;
  automationCapex: number;
  energyKw: number;
  /** Footprint in grid cells. */
  footprintW: number;
  footprintH: number;
  utilities: string[];
  /** Fraction of parts scrapped here, 0–1. */
  scrapRate: number;

  notes: string;
  /** The extendable half. Never read by any engine. */
  custom: CustomField[];
}

export interface ProcessLibrary {
  processes: LibraryProcess[];
  tags: LibraryTag[];
}

export const EMPTY_LIBRARY: ProcessLibrary = { processes: [], tags: [] };

/** A new entry, with everything at a defensible neutral value. */
export function blankProcess(id: string, name = "New process"): LibraryProcess {
  return {
    id,
    name,
    tags: [],
    capabilityId: "unknown",
    role: "process",
    type: "machine",
    auto: "manual",
    cycleTimeSec: 30,
    attendedFraction: 1,
    operators: 1,
    changeoverMin: 0,
    classification: "VA",
    ergoRisk: "low",
    capex: 0,
    automationCapex: 0,
    energyKw: 0,
    footprintW: STATION_DEFAULTS.w,
    footprintH: STATION_DEFAULTS.h,
    utilities: ["power"],
    scrapRate: 0,
    notes: "",
    custom: [],
  };
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

const autoFor = (attended: number): AutoState => (attended >= 1 ? "manual" : attended > 0 ? "semi" : "auto");
const ergoFor = (load: string): ErgoRisk => (load === "heavy" ? "high" : load === "medium" ? "med" : "low");

/**
 * Turn a name into a filled-in entry, using the inference catalog.
 *
 * This is what "New process" runs, so typing "MIG weld" gives you a joining
 * operation at 55s and 60% attended rather than a blank form. The planner then
 * corrects it — which is the same contract the routing field has always had,
 * just applied where the answer gets kept.
 */
export function processFromName(id: string, name: string): LibraryProcess {
  const base = blankProcess(id, name);
  const hint = matchHint(name);
  if (!hint) return base;
  return {
    ...base,
    capabilityId: hint.capabilityId,
    type: TYPE_OF_CATEGORY[hint.category] ?? "machine",
    cycleTimeSec: hint.defaultSeconds,
    attendedFraction: hint.attendedFraction,
    operators: hint.attendedFraction > 0 ? 1 : 0,
    auto: autoFor(hint.attendedFraction),
    classification: hint.classification,
    wasteClass: hint.wasteClass,
    ergoRisk: ergoFor(hint.ergonomicLoad),
  };
}

/**
 * The inference catalog as library entries — an explicit import, not a seed.
 *
 * Offered on the empty state for anyone who would rather start from the twelve
 * generic operations than from nothing. Once imported they are ordinary
 * entries: no flag, no special casing, nothing that says "not yours".
 */
export function fromCapabilities(hints: Array<{ capabilityId: string; label: string }>, idFor: (i: number) => string): LibraryProcess[] {
  return hints.map((h, i) => processFromName(idFor(i), h.label));
}

/**
 * A station carrying this process's numbers, ready to place.
 *
 * "Add process step" used to hand back `makeStation` — "New Step", machine,
 * 30s, one operator — so the first thing anyone did after adding a step was
 * retype all of it.
 *
 * Custom fields ride along in the notes, because `Station` has nowhere typed to
 * put them and inventing a parallel bag on the model would mean migrating every
 * saved cell. They are text a human reads, which is what they were anyway.
 */
export function stationFromProcess(model: Model, p: LibraryProcess): Station {
  const extra = p.custom.filter((c) => c.label.trim() || c.value.trim()).map((c) => `${c.label}: ${c.value}`);
  const notes = [p.notes, ...extra].filter(Boolean).join("\n");
  return {
    ...STATION_DEFAULTS,
    id: newStationId(model),
    x: Math.floor(model.gridW / 2 - 1),
    y: Math.floor(model.gridH / 2 - 1),
    name: p.name,
    role: p.role,
    type: p.type,
    auto: p.auto,
    w: p.footprintW,
    h: p.footprintH,
    cycleTimeSec: p.cycleTimeSec,
    changeoverMin: p.changeoverMin,
    operators: p.operators,
    ergoRisk: p.ergoRisk,
    utilities: p.utilities.slice(),
    scrapRate: p.scrapRate,
    capex: p.capex,
    automationCapex: p.automationCapex,
    energyKw: p.energyKw,
    notes,
  };
}

/**
 * One step of a routing.
 *
 * `ProcessStep` carries more than a name and a time — the generator reads the
 * station type, the ergonomic risk and the scrap rate off it too — so a library
 * pick supplies all four rather than leaving three to be guessed.
 */
export function routingStepFrom(p: LibraryProcess): ProcessStep {
  return {
    name: p.name,
    cycleTimeSec: p.cycleTimeSec,
    type: p.type,
    ergoRisk: p.ergoRisk,
    scrapRate: p.scrapRate > 0 ? p.scrapRate : undefined,
  };
}
