import { useCallback, useState } from "react";
import { DEFAULT_CATALOG, type ProcessCatalogEntry } from "@flowplan/core/model/catalog";
import { getSession, getHydratedLibrary } from "./session";
import { createLibraryEntry, updateLibraryEntry, deleteLibraryEntry } from "./apiClient";

// The process library is the global catalog plus per-team custom entries. When a
// DB session is bootstrapped it is served from Postgres via the API; otherwise
// (unit tests, offline) it falls back to localStorage seeded from the catalog.

const KEY = "flowplan_library";

export function loadLibrary(): ProcessCatalogEntry[] {
  const hydrated = getHydratedLibrary();
  if (hydrated) return hydrated;
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
  // DB-backed sessions persist through the API per-mutation; only the offline
  // fallback mirrors the whole list to localStorage.
  if (getSession()) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
  } catch {
    /* storage full / disabled — non-fatal */
  }
}

/** React hook exposing the library with add/update/remove, persisted. Backed by
 *  the team catalog API when a session exists, else localStorage. */
export function useLibrary() {
  const [entries, setEntries] = useState<ProcessCatalogEntry[]>(loadLibrary);
  const commit = useCallback((next: ProcessCatalogEntry[]) => {
    setEntries(next);
    saveLibrary(next);
  }, []);
  const add = useCallback((e: ProcessCatalogEntry) => {
    const session = getSession();
    if (session) {
      // Optimistic insert; reconcile the server-assigned id when it returns.
      setEntries((cur) => cur.concat([e]));
      createLibraryEntry(session.teamId, e)
        .then((saved) => setEntries((cur) => cur.map((x) => (x.id === e.id ? saved : x))))
        .catch((err) => {
          console.warn("library add failed", err);
          setEntries((cur) => cur.filter((x) => x.id !== e.id));
        });
      return;
    }
    setEntries((cur) => { const next = cur.concat([e]); saveLibrary(next); return next; });
  }, []);
  const update = useCallback((id: string, patch: Partial<ProcessCatalogEntry>) => {
    setEntries((cur) => {
      const next = cur.map((e) => (e.id === id ? { ...e, ...patch } : e));
      const session = getSession();
      if (session) {
        const merged = next.find((e) => e.id === id);
        if (merged) updateLibraryEntry(session.teamId, id, merged).catch((err) => console.warn("library update failed", err));
      } else {
        saveLibrary(next);
      }
      return next;
    });
  }, []);
  const remove = useCallback((id: string) => {
    const session = getSession();
    if (session) deleteLibraryEntry(session.teamId, id).catch((err) => console.warn("library remove failed", err));
    setEntries((cur) => { const next = cur.filter((e) => e.id !== id); saveLibrary(next); return next; });
  }, []);
  const resetToSeed = useCallback(() => commit(DEFAULT_CATALOG.map((e) => ({ ...e }))), [commit]);
  return { entries, add, update, remove, resetToSeed };
}
