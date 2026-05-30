import type { Model } from "@flowplan/core/model/types";
import { type Cell, type Workspace, loadWorkspace, saveWorkspace } from "../workspace";
import { listScenarios, saveScenario, loadScenario, deleteScenario, type ScenarioMeta } from "../scenarios";
import type { StorageProvider } from "./StorageProvider";

// Offline provider: a thin async wrapper over the existing localStorage helpers.
// The whole workspace is one blob, so cell-level mutations re-save the blob. This
// keeps today's behavior (and its tests) intact while satisfying the interface.
export class LocalStorageProvider implements StorageProvider {
  async loadWorkspace(): Promise<Workspace> {
    return loadWorkspace();
  }
  async saveWorkspace(ws: Workspace): Promise<void> {
    saveWorkspace(ws);
  }
  async saveCell(cell: Cell): Promise<void> {
    const ws = loadWorkspace();
    const next = { ...ws, cells: ws.cells.map((c) => (c.id === cell.id ? cell : c)) };
    saveWorkspace(next);
  }
  async createCell(cell: Cell): Promise<Cell> {
    const ws = loadWorkspace();
    saveWorkspace({ ...ws, cells: ws.cells.concat([cell]), activeId: cell.id });
    return cell;
  }
  async renameCell(id: string, name: string): Promise<void> {
    const ws = loadWorkspace();
    saveWorkspace({
      ...ws,
      cells: ws.cells.map((c) => (c.id === id ? { ...c, name, model: { ...c.model, name } } : c)),
    });
  }
  async deleteCell(id: string): Promise<void> {
    const ws = loadWorkspace();
    saveWorkspace({ ...ws, cells: ws.cells.filter((c) => c.id !== id) });
  }
  async listScenarios(): Promise<ScenarioMeta[]> {
    return listScenarios();
  }
  async saveScenario(name: string, model: Model): Promise<void> {
    saveScenario(name, model);
  }
  async loadScenario(name: string): Promise<Model | null> {
    return loadScenario(name);
  }
  async deleteScenario(name: string): Promise<void> {
    deleteScenario(name);
  }
}
