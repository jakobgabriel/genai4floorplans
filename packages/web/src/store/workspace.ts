import type { Model } from "@flowplan/core/model/types";
import { migrate } from "@flowplan/core/model/migrate";
import { loadAutosave } from "./scenarios";
import { SAMPLE } from "@flowplan/core/model/sample";

// A workspace holds several named cells (each a full Model) so FlowPlan stops
// being single-cell. Persisted in localStorage; the active cell drives the app.
// Inter-cell material flow is out of scope — cells are independent for rollups.

export interface Cell {
  id: string;
  name: string;
  model: Model;
  /** Owning folder; null = workspace root (today's flat behavior). */
  folderId: string | null;
  /** Soft-deleted: hidden from the tree, recoverable from the Archive. */
  archived?: boolean;
}

// Arbitrarily-nested folders organize layouts. parentId null = workspace root;
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
  return { id: c.id || newId("cell"), name: c.name || "Cell", model: migrate(c.model), folderId: c.folderId ?? null, archived: !!c.archived };
}

/** Load the workspace, migrating a legacy single-cell autosave into one cell. */
export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw) as Workspace;
      if (ws && Array.isArray(ws.cells) && ws.cells.length) {
        const cells = ws.cells.map(migrateCell);
        const folders = Array.isArray(ws.folders) ? ws.folders.map(migrateFolder) : [];
        const activeId = cells.some((c) => c.id === ws.activeId) ? ws.activeId : cells[0].id;
        return { cells, folders, activeId };
      }
    }
  } catch {
    /* ignore */
  }
  // First run / legacy: seed from the old autosave or the sample.
  const seed = loadAutosave() ?? SAMPLE;
  const cell: Cell = { id: newId("cell"), name: seed.name || "Cell A", model: seed, folderId: null };
  return { cells: [cell], folders: [], activeId: cell.id };
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

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* ignore */
  }
}

export function makeCell(name: string, model: Model, folderId: string | null = null): Cell {
  return { id: newId("cell"), name, model: { ...model, name }, folderId };
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
