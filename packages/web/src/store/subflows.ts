import { useCallback, useState } from "react";
import type { Flow, Model, Station } from "@flowplan/core/model/types";
import { getSession, getHydratedSubflows } from "./session";
import { createSubflow, updateSubflow, deleteSubflow } from "./apiClient";

// User-created grouped elements (node-RED subflows). A subflow captures a set of
// placed stations plus the flows between them, normalised to its own (0,0)
// corner, so it can be dropped back onto any canvas as a reusable building block.
// It is a web/store concept only — the model schema is untouched; INSERT_SUBFLOW
// expands a subflow into ordinary stations + flows through the reducer.

const KEY = "flowplan_subflows";

export interface Subflow {
  id: string;
  name: string;
  category?: string;
  /** Member stations, positions normalised so the group's min corner is (0,0). */
  stations: Station[];
  /** Internal flows among members only. */
  flows: Flow[];
  /** Member ids that are the subflow's INPUTS — fed from outside (or, when the
   *  selection is isolated, the members with no internal predecessor). */
  inputs?: string[];
  /** Member ids that are the subflow's OUTPUTS — feeding outside (or the members
   *  with no internal successor). Like a machine, a subflow has ports. */
  outputs?: string[];
  /** Bounding size in grid cells. */
  w: number;
  h: number;
  createdAt: number;
}

export function loadSubflows(): Subflow[] {
  const hydrated = getHydratedSubflows();
  if (hydrated) return hydrated;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as Subflow[];
    }
  } catch {
    /* ignore malformed */
  }
  return [];
}

function saveSubflows(items: Subflow[]): void {
  // DB-backed sessions persist per-mutation via the API; only the offline
  // fallback mirrors the list to localStorage.
  if (getSession()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/**
 * Build a subflow from the selected stations of a model. Returns null when
 * fewer than two members are selected — a "group" of one is not a group.
 */
export function makeSubflow(model: Model, ids: string[], name: string): Subflow | null {
  const set = new Set(ids);
  const members = model.stations.filter((s) => set.has(s.id));
  if (members.length < 2) return null;
  const minX = Math.min(...members.map((s) => s.x));
  const minY = Math.min(...members.map((s) => s.y));
  const maxX = Math.max(...members.map((s) => s.x + s.w));
  const maxY = Math.max(...members.map((s) => s.y + s.h));
  const stations = members.map((s) => ({ ...s, x: s.x - minX, y: s.y - minY, fixed: false }));
  const flows = model.flows.filter((f) => set.has(f.from) && set.has(f.to)).map((f) => ({ ...f }));

  // Derive the subflow's ports automatically. A member is an INPUT if something
  // OUTSIDE the selection feeds it, an OUTPUT if it feeds outside. When the
  // selection is isolated (no external flows), fall back to the internal
  // endpoints: members with no internal predecessor / successor.
  const uniq = (a: string[]) => [...new Set(a)];
  const extIn = uniq(model.flows.filter((f) => set.has(f.to) && !set.has(f.from)).map((f) => f.to));
  const extOut = uniq(model.flows.filter((f) => set.has(f.from) && !set.has(f.to)).map((f) => f.from));
  const hasInternalPred = new Set(flows.map((f) => f.to));
  const hasInternalSucc = new Set(flows.map((f) => f.from));
  const inputs = extIn.length ? extIn : members.filter((s) => !hasInternalPred.has(s.id)).map((s) => s.id);
  const outputs = extOut.length ? extOut : members.filter((s) => !hasInternalSucc.has(s.id)).map((s) => s.id);

  return {
    id: "sub-" + Math.random().toString(36).slice(2, 9),
    name: name.trim() || `Group of ${members.length}`,
    stations,
    flows,
    inputs,
    outputs,
    w: maxX - minX,
    h: maxY - minY,
    createdAt: Date.now(),
  };
}

/** React hook exposing the subflow library with add/remove/rename, persisted.
 *  Backed by the team subflow API when a session exists, else localStorage. */
export function useSubflows() {
  const [subflows, setSubflows] = useState<Subflow[]>(loadSubflows);
  const add = useCallback((sf: Subflow) => {
    const session = getSession();
    if (session) {
      setSubflows((cur) => cur.concat([sf]));
      createSubflow(session.teamId, sf)
        .then((saved) => setSubflows((cur) => cur.map((s) => (s.id === sf.id ? saved : s))))
        .catch((err) => {
          console.warn("subflow add failed", err);
          setSubflows((cur) => cur.filter((s) => s.id !== sf.id));
        });
      return;
    }
    setSubflows((cur) => { const next = cur.concat([sf]); saveSubflows(next); return next; });
  }, []);
  const remove = useCallback((id: string) => {
    const session = getSession();
    if (session) deleteSubflow(session.teamId, id).catch((err) => console.warn("subflow remove failed", err));
    setSubflows((cur) => { const next = cur.filter((s) => s.id !== id); saveSubflows(next); return next; });
  }, []);
  const rename = useCallback((id: string, name: string) => {
    const session = getSession();
    if (session) updateSubflow(session.teamId, id, { name }).catch((err) => console.warn("subflow rename failed", err));
    setSubflows((cur) => { const next = cur.map((s) => (s.id === id ? { ...s, name } : s)); saveSubflows(next); return next; });
  }, []);
  return { subflows, add, remove, rename };
}
