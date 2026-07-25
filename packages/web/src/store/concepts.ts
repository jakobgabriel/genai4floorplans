import { useCallback, useEffect, useState } from "react";
import {
  CONCEPT_DEFAULTS,
  blankConcept,
  type ConceptProfile,
} from "@flowplan/core/engine/concepts";

// The concept catalog, persisted like the process library.
//
// It used to be a frozen constant in `engine/concepts.ts`, which meant the
// comparison the whole tool exists to produce turned on numbers no user could
// see, question or change. A plant whose U-cells cost 60k a station got ranked
// against 45k and was never told.
//
// Unlike the process library this does NOT start empty. Without at least one
// concept there is nothing to compare and "Plan a cell" produces a blank page;
// and these five are industry archetypes rather than one plant's private
// knowledge, so shipping them is a starting point rather than clutter. What
// matters is that every number is now visible and editable, and that "Reset to
// the shipped defaults" is one button — so the defaults are a position you can
// disagree with rather than a hidden constant.

const KEY = "flowplan_concepts";
// Bump when the persisted concept shape changes incompatibly; `migrate` already
// forward-fills fields, so v1 covers today. A bare array (written before this
// stamp) still loads as the legacy branch below.
const VERSION = 1;

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

const defaults = (): ConceptProfile[] => Object.values(CONCEPT_DEFAULTS).map((c) => ({ ...c, custom: [] }));

/** Fill in whatever a stored profile is missing, so an older shape still loads. */
function migrate(c: Partial<ConceptProfile>): ConceptProfile {
  const base = blankConcept(c.kind || newId("concept"), c.label || "Concept");
  const band = Array.isArray(c.viableVolume) && c.viableVolume.length === 2 ? c.viableVolume : base.viableVolume;
  return {
    ...base,
    ...c,
    kind: c.kind || base.kind,
    label: c.label || base.label,
    viableVolume: [Number(band[0]) || 0, Number(band[1]) || 0],
    forms: Array.isArray(c.forms) && c.forms.length ? c.forms : base.forms,
    custom: Array.isArray(c.custom) ? c.custom : [],
  };
}

export function loadConcepts(): ConceptProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // An emptied catalog is a real state — a planner may want only their own
      // concepts — so only a missing or unreadable entry falls back.
      // Legacy: a bare array. Current: a versioned envelope { version, concepts }.
      if (Array.isArray(parsed)) return parsed.map(migrate);
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.concepts)) {
        return (parsed.concepts as Partial<ConceptProfile>[]).map(migrate);
      }
    }
  } catch {
    /* ignore */
  }
  return defaults();
}

export function saveConcepts(list: ConceptProfile[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, concepts: list }));
  } catch {
    /* ignore */
  }
}

export interface ConceptApi {
  concepts: ConceptProfile[];
  add: (label: string) => ConceptProfile;
  update: (kind: string, patch: Partial<ConceptProfile>) => void;
  remove: (kind: string) => void;
  duplicate: (kind: string) => void;
  /** Put back every shipped profile that is missing. Returns how many. */
  restoreDefaults: () => number;
  /** True when nothing has been changed from what the app shipped. */
  isPristine: boolean;

  addField: (kind: string) => void;
  updateField: (kind: string, fieldId: string, patch: Partial<{ label: string; value: string }>) => void;
  removeField: (kind: string, fieldId: string) => void;
}

const same = (a: ConceptProfile[], b: ConceptProfile[]) => JSON.stringify(a) === JSON.stringify(b);

export function useConcepts(): ConceptApi {
  const [concepts, setConcepts] = useState<ConceptProfile[]>(() => loadConcepts());
  useEffect(() => saveConcepts(concepts), [concepts]);

  const mapOne = useCallback((kind: string, fn: (c: ConceptProfile) => ConceptProfile) => {
    setConcepts((list) => list.map((c) => (c.kind === kind ? fn(c) : c)));
  }, []);

  const add = useCallback((label: string) => {
    const c = blankConcept(newId("concept"), label);
    setConcepts((list) => list.concat([c]));
    return c;
  }, []);

  const update = useCallback(
    (kind: string, patch: Partial<ConceptProfile>) => mapOne(kind, (c) => ({ ...c, ...patch })),
    [mapOne],
  );

  const remove = useCallback((kind: string) => setConcepts((list) => list.filter((c) => c.kind !== kind)), []);

  const duplicate = useCallback((kind: string) => {
    setConcepts((list) => {
      const src = list.find((c) => c.kind === kind);
      if (!src) return list;
      return list.concat([
        {
          ...src,
          kind: newId("concept"),
          label: src.label + " (copy)",
          forms: src.forms.slice(),
          viableVolume: [...src.viableVolume] as [number, number],
          custom: (src.custom ?? []).map((f) => ({ ...f, id: newId("fld") })),
        },
      ]);
    });
  }, []);

  // Computed from the rendered list rather than inside the updater, which React
  // may run later or twice and whose return value cannot be read out.
  const restoreDefaults = useCallback(() => {
    const have = new Set(concepts.map((c) => c.kind));
    const missing = defaults().filter((c) => !have.has(c.kind));
    if (missing.length) setConcepts((list) => list.concat(missing));
    return missing.length;
  }, [concepts]);

  const addField = useCallback(
    (kind: string) =>
      mapOne(kind, (c) => ({ ...c, custom: (c.custom ?? []).concat([{ id: newId("fld"), label: "", value: "" }]) })),
    [mapOne],
  );

  const updateField = useCallback(
    (kind: string, fieldId: string, patch: Partial<{ label: string; value: string }>) =>
      mapOne(kind, (c) => ({
        ...c,
        custom: (c.custom ?? []).map((f) => (f.id === fieldId ? { ...f, ...patch } : f)),
      })),
    [mapOne],
  );

  const removeField = useCallback(
    (kind: string, fieldId: string) =>
      mapOne(kind, (c) => ({ ...c, custom: (c.custom ?? []).filter((f) => f.id !== fieldId) })),
    [mapOne],
  );

  return {
    concepts,
    add,
    update,
    remove,
    duplicate,
    restoreDefaults,
    isPristine: same(concepts, defaults()),
    addField,
    updateField,
    removeField,
  };
}
