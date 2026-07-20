import { useCallback, useState } from "react";
import { DEFAULT_CATALOG, type ProcessCatalogEntry } from "@flowplan/core/model/catalog";

// The process library persists locally and starts from the seed catalog. It is a
// global app resource (not tied to one cell), so it lives in its own store.

const KEY = "flowplan_library";

export function loadLibrary(): ProcessCatalogEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ProcessCatalogEntry[];
    }
  } catch {
    /* fall through to seeds */
  }
  return DEFAULT_CATALOG.map((e) => ({ ...e }));
}

function saveLibrary(entries: ProcessCatalogEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/** React hook exposing the library with add/update/remove, persisted. */
export function useLibrary() {
  const [entries, setEntries] = useState<ProcessCatalogEntry[]>(loadLibrary);
  const commit = useCallback((next: ProcessCatalogEntry[]) => {
    setEntries(next);
    saveLibrary(next);
  }, []);
  const add = useCallback(
    (e: ProcessCatalogEntry) => setEntries((cur) => { const next = cur.concat([e]); saveLibrary(next); return next; }),
    [],
  );
  const update = useCallback(
    (id: string, patch: Partial<ProcessCatalogEntry>) =>
      setEntries((cur) => { const next = cur.map((e) => (e.id === id ? { ...e, ...patch } : e)); saveLibrary(next); return next; }),
    [],
  );
  const remove = useCallback(
    (id: string) => setEntries((cur) => { const next = cur.filter((e) => e.id !== id); saveLibrary(next); return next; }),
    [],
  );
  const resetToSeed = useCallback(() => commit(DEFAULT_CATALOG.map((e) => ({ ...e }))), [commit]);
  return { entries, add, update, remove, resetToSeed };
}
