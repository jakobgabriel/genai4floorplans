import type { Model } from "@flowplan/core/model/types";
import { migrate } from "@flowplan/core/model/migrate";
import { SAMPLE } from "@flowplan/core/model/sample";
import { getProvider, getHydratedWorkspace } from "./session";
import { ConflictError } from "./storage/ApiStorageProvider";

// A workspace holds several named cells (each a full Model) so FlowPlan stops
// being single-cell. Persisted in localStorage; the active cell drives the app.
// Inter-cell material flow is out of scope — cells are independent for rollups.

// A Cell is one editable Model — a single LAYOUT. It belongs to a Concept (the
// workspace item). `folderId` is kept in sync with the owning concept's folder
// so folder-based rollups keep working, but the tree groups layouts by concept.
export interface Cell {
  id: string;
  name: string;
  model: Model;
  /** Owning concept (the workspace item). Null only transiently before wrapping. */
  conceptId: string | null;
  /** Owning folder; mirrors the concept's folder. null = workspace root. */
  folderId: string | null;
  /** Soft-deleted: hidden from the tree, recoverable from the Archive. */
  archived?: boolean;
}

// A Concept is the workspace item: one manufacturing concept, living in a folder
// and containing one or more layouts (Cells). This is the unit the user names,
// files and shares — a layout is an alternative arrangement *within* a concept.
export interface Concept {
  id: string;
  name: string;
  /** Owning folder; null = workspace root. */
  folderId: string | null;
  /** Orders concepts within a folder. */
  position: number;
  /** Soft-deleted (with its layouts). Recoverable from the Archive. */
  archived?: boolean;
}

// Arbitrarily-nested folders organize concepts. parentId null = workspace root;
// position orders siblings within a parent.
export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  position: number;
  /** Soft-deleted (with its contents). Recoverable from the Archive. */
  archived?: boolean;
}

export interface Workspace {
  cells: Cell[];
  concepts: Concept[];
  folders: Folder[];
  activeId: string;
}

const KEY = "flowplan_workspace";

let counter = 0;
function newId(prefix: string): string {
  counter++;
  return prefix + "_" + Date.now().toString(36) + "_" + counter.toString(36);
}

function migrateCell(c: Cell): Cell {
  return { id: c.id || newId("cell"), name: c.name || "Cell", model: migrate(c.model), conceptId: c.conceptId ?? null, folderId: c.folderId ?? null, archived: !!c.archived };
}

function migrateConcept(c: Concept): Concept {
  return {
    id: c.id || newId("cpt"),
    name: c.name || "Concept",
    folderId: c.folderId ?? null,
    position: typeof c.position === "number" ? c.position : 0,
    archived: !!c.archived,
  };
}

/**
 * Ensure every cell belongs to a concept. Legacy workspaces stored layouts
 * loose in folders; here each such layout is wrapped in its own concept (same
 * name, same folder) so "one concept = one workspace item" holds and the tree
 * has a concept level to render. Existing concepts are preserved.
 */
export function wrapLooseCells(cells: Cell[], concepts: Concept[]): { cells: Cell[]; concepts: Concept[] } {
  const known = new Set(concepts.map((c) => c.id));
  const nextConcepts = concepts.slice();
  const posByFolder = new Map<string, number>();
  nextConcepts.forEach((c) => posByFolder.set(String(c.folderId), Math.max(posByFolder.get(String(c.folderId)) ?? -1, c.position)));
  const nextCells = cells.map((cell) => {
    if (cell.conceptId && known.has(cell.conceptId)) return cell;
    const fk = String(cell.folderId ?? null);
    const position = (posByFolder.get(fk) ?? -1) + 1;
    posByFolder.set(fk, position);
    const concept: Concept = { id: newId("cpt"), name: cell.name || "Concept", folderId: cell.folderId ?? null, position, archived: cell.archived };
    nextConcepts.push(concept);
    known.add(concept.id);
    return { ...cell, conceptId: concept.id };
  });
  return { cells: nextCells, concepts: nextConcepts };
}

/** Load the workspace, migrating legacy single-cell / loose-cell shapes. When a
 *  DB session is bootstrapped, the hydrated (server) workspace is returned. */
export function loadWorkspace(): Workspace {
  const hydrated = getHydratedWorkspace();
  if (hydrated) return hydrated;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw) as Workspace;
      if (ws && Array.isArray(ws.cells) && ws.cells.length) {
        const migratedCells = ws.cells.map(migrateCell);
        const folders = Array.isArray(ws.folders) ? ws.folders.map(migrateFolder) : [];
        const existingConcepts = Array.isArray(ws.concepts) ? ws.concepts.map(migrateConcept) : [];
        const { cells, concepts } = wrapLooseCells(migratedCells, existingConcepts);
        const activeId = cells.some((c) => c.id === ws.activeId) ? ws.activeId : cells[0].id;
        return { cells, concepts, folders, activeId };
      }
    }
  } catch {
    /* ignore */
  }
  // First run (offline, no saved workspace): seed from the sample cell.
  const seed = SAMPLE;
  const concept: Concept = { id: newId("cpt"), name: seed.name || "Concept A", folderId: null, position: 0 };
  const cell: Cell = { id: newId("cell"), name: seed.name || "Layout A", model: seed, conceptId: concept.id, folderId: null };
  return { cells: [cell], concepts: [concept], folders: [], activeId: cell.id };
}

function migrateFolder(f: Folder): Folder {
  return {
    id: f.id || newId("fld"),
    name: f.name || "Folder",
    parentId: f.parentId ?? null,
    position: typeof f.position === "number" ? f.position : 0,
    archived: !!f.archived,
  };
}

const OUTBOX_KEY = "flowplan_workspace_outbox";

// The UI registers a handler so a save the server rejects for a version conflict
// (someone else saved first) can reload the latest and tell the user, instead of
// silently dropping their edit. Null when offline / in unit tests.
type ConflictHandler = () => void;
let conflictHandler: ConflictHandler | null = null;
export function setSaveConflictHandler(h: ConflictHandler | null): void {
  conflictHandler = h;
}

// DB-backed save is debounced so the many synchronous saveWorkspace() calls a
// single user action makes coalesce into one tree-reconcile PUT. `pendingWs`
// doubles as a one-slot offline queue: because every save is a full-tree
// snapshot, only the LATEST unsaved snapshot ever matters, so a network failure
// just keeps it and retries (with backoff, and immediately on reconnect).
let providerSaveTimer: ReturnType<typeof setTimeout> | undefined;
let pendingWs: Workspace | null = null;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 2000;
let onlineHooked = false;
// Serialize saves: a second save must not start until the first returns its
// bumped version, or it would send a stale baseVersion and self-conflict (409).
let saving = false;

function mirrorOutbox(ws: Workspace | null): void {
  try {
    if (ws) localStorage.setItem(OUTBOX_KEY, JSON.stringify(ws));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch {
    /* quota / disabled — non-fatal */
  }
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    retryDelay = Math.min(retryDelay * 2, 30000);
    flushToProvider();
  }, retryDelay);
  // Flush the moment connectivity returns, without waiting for the backoff.
  if (!onlineHooked && typeof window !== "undefined" && window.addEventListener) {
    onlineHooked = true;
    window.addEventListener("online", () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
      }
      retryDelay = 2000;
      flushToProvider();
    });
  }
}

function flushToProvider(): void {
  const provider = getProvider();
  if (!provider || !pendingWs || saving) return;
  const toSave = pendingWs;
  saving = true;
  provider
    .saveWorkspace(toSave)
    .then(() => {
      saving = false;
      // Clear only if no newer edit arrived while this save was in flight.
      if (pendingWs === toSave) pendingWs = null;
      mirrorOutbox(null);
      retryDelay = 2000;
      // A newer snapshot queued during the save — send it now (fresh version).
      if (pendingWs) flushToProvider();
    })
    .catch((e) => {
      saving = false;
      if (e instanceof ConflictError) {
        // A concurrent edit won. Drop our now-stale snapshot and let the UI
        // reload the server's version so we never overwrite someone else's work.
        if (pendingWs === toSave) pendingWs = null;
        mirrorOutbox(null);
        conflictHandler?.();
        return;
      }
      // Network / server error: keep the snapshot, persist it, and retry.
      mirrorOutbox(toSave);
      scheduleRetry();
      console.warn("workspace save failed; queued for retry", e);
    });
}

export function saveWorkspace(ws: Workspace): void {
  const provider = getProvider();
  if (provider) {
    pendingWs = ws;
    if (providerSaveTimer) clearTimeout(providerSaveTimer);
    providerSaveTimer = setTimeout(flushToProvider, 600);
    return;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* ignore */
  }
}

export function makeCell(name: string, model: Model, folderId: string | null = null, conceptId: string | null = null): Cell {
  return { id: newId("cell"), name, model: { ...model, name }, folderId, conceptId };
}

export function makeConcept(name: string, folderId: string | null, position: number): Concept {
  return { id: newId("cpt"), name, folderId, position };
}

export function makeFolder(name: string, parentId: string | null, position: number): Folder {
  return { id: newId("fld"), name, parentId, position };
}

/** True if `candidateId` is `folderId` itself or one of its descendants — the
 *  guard that stops a folder being moved into its own subtree (a cycle). */
export function isDescendant(folders: Folder[], folderId: string, candidateId: string | null): boolean {
  let cursor = candidateId;
  while (cursor) {
    if (cursor === folderId) return true;
    cursor = folders.find((f) => f.id === cursor)?.parentId ?? null;
  }
  return false;
}

/** A folder id plus all of its descendant folder ids — the subtree to act on
 *  when archiving / restoring / permanently deleting a folder and its contents. */
export function subtreeFolderIds(folders: Folder[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) {
        ids.add(f.id);
        added = true;
      }
    }
  }
  return ids;
}
