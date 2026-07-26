import { useCallback, useEffect, useState } from "react";
import {
  EMPTY_LIBRARY,
  TAG_COLORS,
  blankProcess,
  fromCapabilities,
  processFromName,
  type CustomField,
  type LibraryProcess,
  type LibraryTag,
  type ProcessLibrary,
  type TagColor,
} from "@flowplan/core/model/library";
import { CAPABILITY_HINTS } from "@flowplan/core/engine/infer";

// The process library, persisted beside the workspace.
//
// Same storage story as `workspace.ts`: localStorage, JSON, tolerant of a
// missing or corrupt entry. Separate from the workspace on purpose — the
// library outlives any one cell, and resetting to the sample must not cost a
// planner the processes they entered.
//
// It starts EMPTY. Shipping a seeded catalog meant every planner's first job
// was telling their own entries apart from twelve generic ones they never
// asked for, and deleting them. The inference catalog is still available, as
// an import they choose.

const KEY = "flowplan_library";
// Bump when the persisted library shape changes incompatibly; `migrateProcess`
// already forward-fills fields, so v1 covers today. Legacy data (a bare array,
// or an object with no version) still loads through the branches below.
const VERSION = 1;

let counter = 0;
function newId(prefix: string): string {
  counter++;
  return prefix + "_" + Date.now().toString(36) + "_" + counter.toString(36);
}

/** Fill in whatever a stored entry is missing, so an older shape still loads. */
function migrateProcess(p: Partial<LibraryProcess>): LibraryProcess {
  const base = blankProcess(p.id || newId("lib"));
  return {
    ...base,
    ...p,
    id: p.id || base.id,
    name: p.name || base.name,
    tags: Array.isArray(p.tags) ? p.tags : [],
    custom: Array.isArray(p.custom) ? p.custom : [],
    utilities: Array.isArray(p.utilities) ? p.utilities : base.utilities,
    cycleTimeSec: Number.isFinite(p.cycleTimeSec) ? Number(p.cycleTimeSec) : base.cycleTimeSec,
  };
}

function migrateTag(t: Partial<LibraryTag>): LibraryTag {
  return {
    id: t.id || newId("tag"),
    name: t.name || "Tag",
    color: (TAG_COLORS as readonly string[]).includes(t.color ?? "") ? (t.color as TagColor) : "gray",
  };
}

export function loadLibrary(): ProcessLibrary {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // An empty library is a real state, so only a missing or unreadable
      // entry falls back — and it falls back to empty, not to a seed.
      if (Array.isArray(parsed)) return { processes: parsed.map(migrateProcess), tags: [] };
      if (parsed && Array.isArray(parsed.processes)) {
        return {
          processes: parsed.processes.map(migrateProcess),
          tags: Array.isArray(parsed.tags) ? parsed.tags.map(migrateTag) : [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  return { processes: [], tags: [] };
}

export function saveLibrary(lib: ProcessLibrary): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...lib }));
  } catch {
    /* ignore */
  }
}

export interface LibraryApi {
  processes: LibraryProcess[];
  tags: LibraryTag[];
  /** Adds an entry, inferring what it can from the name. */
  add: (name?: string) => LibraryProcess;
  update: (id: string, patch: Partial<LibraryProcess>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  /** Import the inference catalog as ordinary entries. Returns how many. */
  importCapabilities: () => number;

  addTag: (name: string) => LibraryTag;
  updateTag: (id: string, patch: Partial<LibraryTag>) => void;
  /** Removes the tag and detaches it from every process carrying it. */
  removeTag: (id: string) => void;
  toggleTag: (processId: string, tagId: string) => void;

  addField: (processId: string) => void;
  updateField: (processId: string, fieldId: string, patch: Partial<CustomField>) => void;
  removeField: (processId: string, fieldId: string) => void;
}

export function useLibrary(): LibraryApi {
  const [lib, setLib] = useState<ProcessLibrary>(() => loadLibrary());
  useEffect(() => saveLibrary(lib), [lib]);

  const patchProcesses = useCallback((fn: (list: LibraryProcess[]) => LibraryProcess[]) => {
    setLib((l) => ({ ...l, processes: fn(l.processes) }));
  }, []);

  const mapProcess = useCallback(
    (id: string, fn: (p: LibraryProcess) => LibraryProcess) => {
      patchProcesses((list) => list.map((p) => (p.id === id ? fn(p) : p)));
    },
    [patchProcesses],
  );

  const add = useCallback(
    (name?: string) => {
      const p = name ? processFromName(newId("lib"), name) : blankProcess(newId("lib"));
      patchProcesses((list) => list.concat([p]));
      return p;
    },
    [patchProcesses],
  );

  const update = useCallback(
    (id: string, patch: Partial<LibraryProcess>) => mapProcess(id, (p) => ({ ...p, ...patch })),
    [mapProcess],
  );

  const remove = useCallback((id: string) => patchProcesses((list) => list.filter((p) => p.id !== id)), [patchProcesses]);

  const duplicate = useCallback(
    (id: string) => {
      patchProcesses((list) => {
        const src = list.find((p) => p.id === id);
        if (!src) return list;
        const copy: LibraryProcess = {
          ...src,
          id: newId("lib"),
          name: src.name + " (copy)",
          tags: src.tags.slice(),
          custom: src.custom.map((c) => ({ ...c, id: newId("fld") })),
        };
        return list.concat([copy]);
      });
    },
    [patchProcesses],
  );

  // Computed from the rendered list rather than inside the updater, which
  // React may run later or twice and whose return value cannot be read out.
  const importCapabilities = useCallback(() => {
    const have = new Set(lib.processes.map((p) => p.name.trim().toLowerCase()));
    const fresh = fromCapabilities(CAPABILITY_HINTS, (i) => newId("lib" + i)).filter(
      (p) => !have.has(p.name.trim().toLowerCase()),
    );
    if (fresh.length) patchProcesses((list) => list.concat(fresh));
    return fresh.length;
  }, [lib.processes, patchProcesses]);

  const addTag = useCallback((name: string) => {
    const tag: LibraryTag = { id: newId("tag"), name, color: "gray" };
    setLib((l) => ({ ...l, tags: l.tags.concat([tag]) }));
    return tag;
  }, []);

  const updateTag = useCallback((id: string, patch: Partial<LibraryTag>) => {
    setLib((l) => ({ ...l, tags: l.tags.map((t) => (t.id === id ? { ...t, ...patch } : t)) }));
  }, []);

  const removeTag = useCallback((id: string) => {
    // Detaching it everywhere is the point: a process left carrying a deleted
    // tag id would filter to nothing and look like a bug.
    setLib((l) => ({
      tags: l.tags.filter((t) => t.id !== id),
      processes: l.processes.map((p) => (p.tags.includes(id) ? { ...p, tags: p.tags.filter((t) => t !== id) } : p)),
    }));
  }, []);

  const toggleTag = useCallback(
    (processId: string, tagId: string) =>
      mapProcess(processId, (p) => ({
        ...p,
        tags: p.tags.includes(tagId) ? p.tags.filter((t) => t !== tagId) : p.tags.concat([tagId]),
      })),
    [mapProcess],
  );

  const addField = useCallback(
    (processId: string) =>
      mapProcess(processId, (p) => ({ ...p, custom: p.custom.concat([{ id: newId("fld"), label: "", value: "", type: "text" }]) })),
    [mapProcess],
  );

  const updateField = useCallback(
    (processId: string, fieldId: string, patch: Partial<CustomField>) =>
      mapProcess(processId, (p) => ({
        ...p,
        custom: p.custom.map((c) => (c.id === fieldId ? { ...c, ...patch } : c)),
      })),
    [mapProcess],
  );

  const removeField = useCallback(
    (processId: string, fieldId: string) =>
      mapProcess(processId, (p) => ({ ...p, custom: p.custom.filter((c) => c.id !== fieldId) })),
    [mapProcess],
  );

  return {
    processes: lib.processes,
    tags: lib.tags,
    add,
    update,
    remove,
    duplicate,
    importCapabilities,
    addTag,
    updateTag,
    removeTag,
    toggleTag,
    addField,
    updateField,
    removeField,
  };
}

export { EMPTY_LIBRARY };
