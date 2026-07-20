import type { ErgonomicLoad, WasteClass, WorkClass, WorkElement } from "../model/types";

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
    if (hint) matched++;
    else unmatched.push(name);

    const seconds = step.seconds != null && step.seconds > 0 ? step.seconds : h.defaultSeconds;

    const note = (field: InferredField, value: string, why: string) =>
      notes.push({ elementId: id, elementName: name, field, value, why });

    if (hint) note("capability", h.capabilityId, `matched on the step name`);
    else note("capability", "unknown", `no keyword matched — capability unresolved`);

    if (step.seconds == null || step.seconds <= 0) {
      note("time", `${seconds}s`, `no time given; typical for ${h.capabilityId}`);
    }
    note("classification", h.classification + (h.wasteClass ? ` / ${h.wasteClass}` : ""), `typical for ${h.capabilityId}`);
    note("attendedFraction", String(h.attendedFraction), `typical operator binding for ${h.capabilityId}`);
    note("ergonomics", h.ergonomicLoad, `typical for ${h.capabilityId}`);
    if (i > 0) note("precedence", `after we${i}`, `assumed linear — edit if steps can run in parallel`);

    return {
      id,
      name,
      capabilityId: hint ? h.capabilityId : undefined,
      predecessors: i > 0 ? ["we" + i] : [],
      time: {
        seconds,
        method: "estimate",
        // A time the planner typed is still an estimate, but a better one than
        // a catalog default.
        confidence: step.seconds != null && step.seconds > 0 ? "med" : "low",
      },
      classification: h.classification,
      wasteClass: h.wasteClass,
      attendedFraction: h.attendedFraction,
      ergonomicLoad: h.ergonomicLoad,
    };
  });

  return {
    elements,
    notes,
    unmatched,
    matchRatePct: steps.length > 0 ? +((matched / steps.length) * 100).toFixed(0) : 0,
  };
}
