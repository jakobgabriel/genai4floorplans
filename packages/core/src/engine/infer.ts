import type { Confidence, CycleBreakdown, ErgonomicLoad, TimeMethod, WasteClass, WorkClass, WorkElement } from "../model/types";
import { sumCycle } from "../model/types";

// Input inference (spec §13.2 "zero-friction entry", risk §11.2).
//
// The spec's WorkElement is rich: capability, precedence, classification,
// attended fraction, ergonomics, confidence. Nobody will type that for 40
// elements, and a tool that demands it will lose to the spreadsheet.
//
// So the planner supplies the minimum — a pasted list of step names, times
// optional — and everything else is INFERRED. Every inferred field is marked
// low confidence and reported in `notes`, so the tool never presents a guess as
// a fact (§9) and the planner knows exactly what to correct.
//
// This is deliberately a keyword heuristic, not ML. It is inspectable, it is
// correctable, and being wrong in a visible way is far better than being
// opaquely right.

export interface CapabilityHint {
  /** Capability id the keyword maps to. */
  capabilityId: string;
  category: "join" | "form" | "cut" | "inspect" | "handle" | "mark" | "test" | "transport" | "surface";
  classification: WorkClass;
  wasteClass?: WasteClass;
  /** How much of the duration binds an operator. */
  attendedFraction: number;
  ergonomicLoad: ErgonomicLoad;
  /** Fallback duration when the planner gave no time. */
  defaultSeconds: number;
  keywords: string[];
}

/**
 * The seed catalog. Deliberately small and legible — this is rules-as-data
 * (§2.7) in its simplest form and is meant to be replaced by a governed
 * catalog, not grown indefinitely here.
 */
export const CAPABILITY_HINTS: CapabilityHint[] = [
  {
    capabilityId: "cut.machining",
    category: "cut",
    classification: "VA",
    attendedFraction: 0.2,
    ergonomicLoad: "light",
    defaultSeconds: 45,
    keywords: ["mill", "turn", "drill", "cnc", "lathe", "grind", "bore", "ream", "saw", "cut"],
  },
  {
    capabilityId: "form.press",
    category: "form",
    classification: "VA",
    attendedFraction: 0.3,
    ergonomicLoad: "medium",
    defaultSeconds: 30,
    keywords: ["press", "stamp", "form", "bend", "punch", "draw", "swage", "crimp"],
  },
  {
    capabilityId: "join.weld",
    category: "join",
    classification: "VA",
    attendedFraction: 0.6,
    ergonomicLoad: "medium",
    defaultSeconds: 55,
    keywords: ["weld", "braze", "solder", "bond", "glue", "rivet"],
  },
  {
    capabilityId: "join.assemble",
    category: "join",
    classification: "VA",
    attendedFraction: 1,
    ergonomicLoad: "medium",
    defaultSeconds: 40,
    keywords: ["assemble", "assembly", "fit", "mount", "screw", "bolt", "clip", "insert", "join"],
  },
  {
    capabilityId: "inspect.visual",
    category: "inspect",
    classification: "NNVA",
    attendedFraction: 1,
    ergonomicLoad: "light",
    defaultSeconds: 20,
    keywords: ["inspect", "check", "visual", "gauge", "measure", "verify", "control"],
  },
  {
    capabilityId: "test.function",
    category: "test",
    classification: "NNVA",
    attendedFraction: 0.4,
    ergonomicLoad: "light",
    defaultSeconds: 30,
    keywords: ["test", "leak", "eol", "function", "calibrat", "burn-in"],
  },
  {
    capabilityId: "surface.finish",
    category: "surface",
    classification: "NNVA",
    attendedFraction: 0.7,
    ergonomicLoad: "medium",
    defaultSeconds: 25,
    keywords: ["deburr", "clean", "wash", "paint", "coat", "polish", "blast"],
  },
  {
    capabilityId: "mark.identify",
    category: "mark",
    classification: "NNVA",
    attendedFraction: 0.5,
    ergonomicLoad: "light",
    defaultSeconds: 10,
    keywords: ["mark", "label", "engrave", "laser", "stamp id", "print", "serial"],
  },
  {
    capabilityId: "handle.load",
    category: "handle",
    classification: "NNVA",
    attendedFraction: 1,
    ergonomicLoad: "medium",
    defaultSeconds: 15,
    keywords: ["load", "unload", "place", "pick", "position", "clamp", "fixture", "orient"],
  },
  {
    capabilityId: "handle.pack",
    category: "handle",
    classification: "NNVA",
    attendedFraction: 1,
    ergonomicLoad: "medium",
    defaultSeconds: 20,
    keywords: ["pack", "box", "palletis", "palletiz", "wrap", "label out"],
  },
  {
    capabilityId: "transport.move",
    category: "transport",
    classification: "NVA",
    wasteClass: "transport",
    attendedFraction: 1,
    ergonomicLoad: "heavy",
    defaultSeconds: 20,
    keywords: ["move", "transport", "carry", "convey", "transfer", "walk", "fetch"],
  },
  {
    capabilityId: "wait.queue",
    category: "handle",
    classification: "NVA",
    wasteClass: "waiting",
    attendedFraction: 0,
    ergonomicLoad: "light",
    defaultSeconds: 0,
    keywords: ["wait", "queue", "buffer", "cool", "cure", "dry", "rest"],
  },
];

/** Fallback when no keyword matches — deliberately unopinionated. */
export const UNKNOWN_HINT: CapabilityHint = {
  capabilityId: "unknown",
  category: "handle",
  classification: "VA",
  attendedFraction: 1,
  ergonomicLoad: "medium",
  defaultSeconds: 30,
  keywords: [],
};

/**
 * Best keyword match for a step name, or null when nothing matches.
 *
 * Earliest match wins, then longest. Step names are written verb-first — "Move
 * to buffer", "Carry to press" — so position beats specificity: matching on
 * length alone picks the noun ("buffer", "press") and mis-classifies the step.
 */
export function matchHint(name: string): CapabilityHint | null {
  const n = name.toLowerCase();
  let best: CapabilityHint | null = null;
  let bestPos = Infinity;
  let bestLen = 0;
  CAPABILITY_HINTS.forEach((h) => {
    h.keywords.forEach((k) => {
      const pos = n.indexOf(k);
      if (pos < 0) return;
      if (pos < bestPos || (pos === bestPos && k.length > bestLen)) {
        best = h;
        bestPos = pos;
        bestLen = k.length;
      }
    });
  });
  return best;
}

export interface RawStep {
  name: string;
  /** Omit to have it inferred from the matched capability. */
  seconds?: number;
  // ---- optional explicit overrides ----------------------------------------
  // When the planner has supplied a field it is used verbatim instead of the
  // keyword guess, and its inference note is dropped (it is no longer a guess).
  // Absent fields fall back to inference, so the minimal paste path is unchanged.
  /** Capability id, chosen from the catalog rather than matched from the name. */
  capabilityId?: string;
  classification?: WorkClass;
  wasteClass?: WasteClass;
  /** 0–1 operator binding. */
  attendedFraction?: number;
  ergonomicLoad?: ErgonomicLoad;
  /** How the time was obtained, and how much to trust it. */
  timeMethod?: TimeMethod;
  confidence?: Confidence;
  /** Predecessors as 0-based indices into the step list. Absent ⇒ linear chain. */
  predecessors?: number[];
  /** Per-part value-add / NVA split. When present, seconds = its sum. */
  cycle?: CycleBreakdown;
  /** Fraction of parts scrapped at this step (0–1). Absent ⇒ 0. */
  scrapRate?: number;
  /** Parts processed together in one cycle (multi-cavity). Absent ⇒ 1. */
  partsPerCycle?: number;
}

export type InferredField = "capability" | "time" | "classification" | "attendedFraction" | "ergonomics" | "precedence";

export interface InferenceNote {
  elementId: string;
  elementName: string;
  field: InferredField;
  value: string;
  why: string;
}

export interface InferenceResult {
  elements: WorkElement[];
  notes: InferenceNote[];
  /** Steps where no keyword matched — the planner should name these better. */
  unmatched: string[];
  /** Share of elements whose capability was matched, 0–100. */
  matchRatePct: number;
}

/**
 * Turn a minimal step list into a full WorkElement set.
 *
 * Precedence defaults to a linear chain: it is the only safe assumption without
 * product data, it is correct for most cells, and it is trivially editable
 * afterwards. The alternative — demanding a DAG up front — is the single
 * biggest adoption risk in the spec (§11.2).
 */
export function inferWorkload(steps: RawStep[]): InferenceResult {
  const notes: InferenceNote[] = [];
  const unmatched: string[] = [];
  let matched = 0;

  const elements: WorkElement[] = steps.map((step, i) => {
    const id = "we" + (i + 1);
    const name = step.name.trim() || `Step ${i + 1}`;
    const hint = matchHint(name);
    const h = hint ?? UNKNOWN_HINT;
    // An explicitly-chosen capability counts as resolved, matched or not.
    if (hint || step.capabilityId) matched++;
    else unmatched.push(name);

    // A supplied cycle decomposition is authoritative for the duration.
    const cycleSum = step.cycle ? +sumCycle(step.cycle).toFixed(1) : undefined;
    const typedSeconds = cycleSum != null ? cycleSum : step.seconds != null && step.seconds > 0 ? step.seconds : undefined;
    const seconds = typedSeconds != null ? typedSeconds : h.defaultSeconds;

    // Resolve each field to the override when given, else the keyword guess.
    const capabilityId = step.capabilityId ?? (hint ? h.capabilityId : undefined);
    const classification = step.classification ?? h.classification;
    const wasteClass = step.wasteClass ?? (classification === h.classification ? h.wasteClass : undefined);
    const attendedFraction = step.attendedFraction ?? h.attendedFraction;
    const ergonomicLoad = step.ergonomicLoad ?? h.ergonomicLoad;
    const predecessors = step.predecessors
      ? step.predecessors.filter((p) => p >= 0 && p < i).map((p) => "we" + (p + 1))
      : i > 0
        ? ["we" + i]
        : [];

    const note = (field: InferredField, value: string, why: string) =>
      notes.push({ elementId: id, elementName: name, field, value, why });

    // Note only the fields that were actually inferred (not overridden).
    if (step.capabilityId == null) {
      if (hint) note("capability", h.capabilityId, `matched on the step name`);
      else note("capability", "unknown", `no keyword matched — capability unresolved`);
    }
    if (typedSeconds == null) note("time", `${seconds}s`, `no time given; typical for ${h.capabilityId}`);
    if (step.classification == null) note("classification", classification + (wasteClass ? ` / ${wasteClass}` : ""), `typical for ${h.capabilityId}`);
    if (step.attendedFraction == null) note("attendedFraction", String(attendedFraction), `typical operator binding for ${h.capabilityId}`);
    if (step.ergonomicLoad == null) note("ergonomics", ergonomicLoad, `typical for ${h.capabilityId}`);
    if (step.predecessors == null && i > 0) note("precedence", `after we${i}`, `assumed linear — edit if steps can run in parallel`);

    return {
      id,
      name,
      capabilityId,
      predecessors,
      time: {
        seconds,
        method: step.timeMethod ?? "estimate",
        // A time the planner typed is still an estimate, but a better one than
        // a catalog default. An explicit confidence override wins.
        confidence: step.confidence ?? (typedSeconds != null ? "med" : "low"),
      },
      classification,
      wasteClass,
      attendedFraction,
      ergonomicLoad,
      scrapRate: step.scrapRate && step.scrapRate > 0 ? step.scrapRate : undefined,
      partsPerCycle: step.partsPerCycle && step.partsPerCycle > 1 ? Math.floor(step.partsPerCycle) : undefined,
    };
  });

  return {
    elements,
    notes,
    unmatched,
    matchRatePct: steps.length > 0 ? +((matched / steps.length) * 100).toFixed(0) : 0,
  };
}
