import { useCallback, useEffect, useState } from "react";
import { SEED_LIBRARY, blankProcess, type LibraryProcess } from "@flowplan/core/model/library";

// The process library, persisted beside the workspace.
//
// Same storage story as `workspace.ts`: localStorage, JSON, tolerant of a
// missing or corrupt entry. It is separate from the workspace on purpose — the
// library outlives any one cell, and a planner who resets to the sample should
// not lose the processes they entered.

const KEY = "flowplan_library";

let counter = 0;
function newId(): string {
  counter++;
  return "lib_" + Date.now().toString(36) + "_" + counter.toString(36);
}

/** Fill in whatever a stored entry is missing, so an older shape still loads. */
function migrate(p: Partial<LibraryProcess>): LibraryProcess {
  const base = blankProcess(p.id || newId());
  return {
    ...base,
    ...p,
    id: p.id || base.id,
    name: p.name || base.name,
    cycleTimeSec: Number.isFinite(p.cycleTimeSec) ? Number(p.cycleTimeSec) : base.cycleTimeSec,
  };
}

export function loadLibrary(): LibraryProcess[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // An empty library is a real state — the planner deleted everything —
      // so only a missing or non-array entry falls back to the seed.
      if (Array.isArray(parsed)) return parsed.map(migrate);
    }
  } catch {
    /* ignore */
  }
  return SEED_LIBRARY.map((p) => ({ ...p }));
}

export function saveLibrary(processes: LibraryProcess[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(processes));
  } catch {
    /* ignore */
  }
}

export interface LibraryApi {
  processes: LibraryProcess[];
  add: () => LibraryProcess;
  update: (id: string, patch: Partial<LibraryProcess>) => void;
  remove: (id: string) => void;
  /** Put back every seeded entry the planner deleted, leaving their own alone. */
  restoreSeeded: () => number;
}

export function useLibrary(): LibraryApi {
  const [processes, setProcesses] = useState<LibraryProcess[]>(() => loadLibrary());
  useEffect(() => saveLibrary(processes), [processes]);

  const add = useCallback(() => {
    const p = blankProcess(newId());
    setProcesses((list) => list.concat([p]));
    return p;
  }, []);

  const update = useCallback((id: string, patch: Partial<LibraryProcess>) => {
    setProcesses((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }, []);

  const remove = useCallback((id: string) => {
    setProcesses((list) => list.filter((p) => p.id !== id));
  }, []);

  // Computed from the rendered list rather than inside the updater, which
  // React may run later or twice and whose return value cannot be read out.
  const restoreSeeded = useCallback(() => {
    const have = new Set(processes.map((p) => p.id));
    const missing = SEED_LIBRARY.filter((p) => !have.has(p.id));
    if (missing.length) setProcesses((list) => list.concat(missing.map((p) => ({ ...p }))));
    return missing.length;
  }, [processes]);

  return { processes, add, update, remove, restoreSeeded };
}
