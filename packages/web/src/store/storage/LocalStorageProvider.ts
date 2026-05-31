import type { Model } from "@flowplan/core/model/types";
import { type Cell, type Folder, type Workspace, loadWorkspace, saveWorkspace, makeFolder, isDescendant } from "../workspace";
import { listScenarios, saveScenario, loadScenario, deleteScenario, moveScenario, type ScenarioMeta } from "../scenarios";
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
  async moveCell(id: string, folderId: string | null): Promise<void> {
    const ws = loadWorkspace();
    saveWorkspace({ ...ws, cells: ws.cells.map((c) => (c.id === id ? { ...c, folderId } : c)) });
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
  async moveScenario(name: string, folderId: string | null): Promise<void> {
    moveScenario(name, folderId);
  }
  async createFolder(folder: Folder): Promise<Folder> {
    const ws = loadWorkspace();
    const siblings = ws.folders.filter((f) => f.parentId === folder.parentId).length;
    const created = makeFolder(folder.name, folder.parentId, siblings);
    saveWorkspace({ ...ws, folders: ws.folders.concat([created]) });
    return created;
  }
  async renameFolder(id: string, name: string): Promise<void> {
    const ws = loadWorkspace();
    saveWorkspace({ ...ws, folders: ws.folders.map((f) => (f.id === id ? { ...f, name } : f)) });
  }
  async moveFolder(id: string, parentId: string | null, position?: number): Promise<void> {
    const ws = loadWorkspace();
    if (parentId === id || isDescendant(ws.folders, id, parentId)) return; // cycle guard
    saveWorkspace({
      ...ws,
      folders: ws.folders.map((f) => (f.id === id ? { ...f, parentId, position: position ?? f.position } : f)),
    });
  }
  async deleteFolder(id: string): Promise<void> {
    const ws = loadWorkspace();
    const target = ws.folders.find((f) => f.id === id);
    if (!target) return;
    const up = target.parentId;
    saveWorkspace({
      ...ws,
      folders: ws.folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: up } : f)),
      cells: ws.cells.map((c) => (c.folderId === id ? { ...c, folderId: up } : c)),
    });
  }
}
