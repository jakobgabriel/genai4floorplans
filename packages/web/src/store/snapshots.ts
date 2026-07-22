import type { Model } from "@flowplan/core/model/types";

// Immutable snapshots (spec §6, audit C-10). A snapshot is a FROZEN copy of a
// layout's model at a moment — a release / baseline you can always return to and
// diff against, so a model that is otherwise mutated in place stays reconstructible
// to its exact approved state.
//
// Persistence: a dedicated localStorage store keyed by cell id, deliberately
// separate from the workspace tree. The server's tree reconcile only round-trips
// known cell fields, so embedding snapshots there would drop them on the next
// hydrate; a standalone client store always survives a reload. (Server-synced
// releases are a later increment.)

export interface Snapshot {
  id: string;
  cellId: string;
  /** Human label — e.g. "Gate-2 release", "before automation". */
  label: string;
  note?: string;
  /** Epoch ms when captured. */
  createdAt: number;
  /** The snapshot this one was taken from, if the model was restored from one —
   *  the version lineage (§6 parent_version). Null for a fresh capture. */
  parentId: string | null;
  schemaVersion: number;
  /** Deep-frozen model copy — never a reference to the live model. */
  model: Model;
}

const KEY = "flowplan_snapshots";

let counter = 0;
function newId(): string {
  counter++;
  return "snap_" + Date.now().toString(36) + "_" + counter.toString(36);
}

type Store = Record<string, Snapshot[]>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* ignore malformed / disabled storage */
  }
  return {};
}

function persist(store: Store): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* quota / disabled — non-fatal */
  }
}

/** A deep, detached clone so the snapshot can never be mutated by later edits. */
function freeze(model: Model): Model {
  return JSON.parse(JSON.stringify(model)) as Model;
}

/** Snapshots for one layout, newest first. */
export function snapshotsFor(cellId: string): Snapshot[] {
  return (load()[cellId] ?? []).slice().sort((a, b) => b.createdAt - a.createdAt);
}

/** Every snapshot across all layouts, newest first — for cross-layout mining. */
export function allSnapshots(): Snapshot[] {
  const store = load();
  return Object.values(store).flat().sort((a, b) => b.createdAt - a.createdAt);
}

/** Freeze the current model as a new snapshot and return it. */
export function captureSnapshot(cellId: string, model: Model, label: string, note?: string, parentId: string | null = null): Snapshot {
  const snap: Snapshot = {
    id: newId(),
    cellId,
    label: label.trim() || "Untitled",
    ...(note && note.trim() ? { note: note.trim() } : {}),
    createdAt: Date.now(),
    parentId,
    schemaVersion: model.schemaVersion,
    model: freeze(model),
  };
  const store = load();
  store[cellId] = [snap, ...(store[cellId] ?? [])];
  persist(store);
  return snap;
}

export function deleteSnapshot(cellId: string, id: string): void {
  const store = load();
  if (!store[cellId]) return;
  store[cellId] = store[cellId].filter((s) => s.id !== id);
  persist(store);
}

/** Drop all snapshots for a cell (called when the cell is purged). */
export function clearSnapshots(cellId: string): void {
  const store = load();
  if (store[cellId]) {
    delete store[cellId];
    persist(store);
  }
}

/** A fresh, detached model copy for restoring into the editor. */
export function restoreModel(snap: Snapshot): Model {
  return freeze(snap.model);
}
