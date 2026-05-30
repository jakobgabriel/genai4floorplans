import type { Model } from "../model/types";
import { migrate } from "../model/migrate";
import { loadAutosave } from "./scenarios";
import { SAMPLE } from "../model/sample";

// A workspace holds several named cells (each a full Model) so FlowPlan stops
// being single-cell. Persisted in localStorage; the active cell drives the app.
// Inter-cell material flow is out of scope — cells are independent for rollups.

export interface Cell {
  id: string;
  name: string;
  model: Model;
}

export interface Workspace {
  cells: Cell[];
  activeId: string;
}

const KEY = "flowplan_workspace";

let counter = 0;
function newId(): string {
  counter++;
  return "cell_" + Date.now().toString(36) + "_" + counter.toString(36);
}

function migrateCell(c: Cell): Cell {
  return { id: c.id || newId(), name: c.name || "Cell", model: migrate(c.model) };
}

/** Load the workspace, migrating a legacy single-cell autosave into one cell. */
export function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const ws = JSON.parse(raw) as Workspace;
      if (ws && Array.isArray(ws.cells) && ws.cells.length) {
        const cells = ws.cells.map(migrateCell);
        const activeId = cells.some((c) => c.id === ws.activeId) ? ws.activeId : cells[0].id;
        return { cells, activeId };
      }
    }
  } catch {
    /* ignore */
  }
  // First run / legacy: seed from the old autosave or the sample.
  const seed = loadAutosave() ?? SAMPLE;
  const cell: Cell = { id: newId(), name: seed.name || "Cell A", model: seed };
  return { cells: [cell], activeId: cell.id };
}

export function saveWorkspace(ws: Workspace): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(ws));
  } catch {
    /* ignore */
  }
}

export function makeCell(name: string, model: Model): Cell {
  return { id: newId(), name, model: { ...model, name } };
}
