import type { Model } from "@flowplan/core/model/types";
import type { Cell, Folder, Workspace } from "../workspace";
import type { ScenarioMeta } from "../scenarios";

// Abstraction over where workspace data lives. LocalStorageProvider keeps today's
// offline behavior; ApiStorageProvider talks to the backend when signed in. Both
// satisfy the same contract (see storage.contract.test.ts), so useFlowPlan doesn't
// care which one it's given.
export interface StorageProvider {
  loadWorkspace(): Promise<Workspace>;
  saveWorkspace(ws: Workspace): Promise<void>;
  saveCell(cell: Cell): Promise<void>;
  createCell(cell: Cell): Promise<Cell>;
  renameCell(id: string, name: string): Promise<void>;
  deleteCell(id: string): Promise<void>;
  /** Move a layout into a folder (or back to root with null). */
  moveCell(id: string, folderId: string | null): Promise<void>;
  listScenarios(): Promise<ScenarioMeta[]>;
  saveScenario(name: string, model: Model): Promise<void>;
  loadScenario(name: string): Promise<Model | null>;
  deleteScenario(name: string): Promise<void>;
  moveScenario(name: string, folderId: string | null): Promise<void>;
  // ---- folders ----
  createFolder(folder: Folder): Promise<Folder>;
  renameFolder(id: string, name: string): Promise<void>;
  moveFolder(id: string, parentId: string | null, position?: number): Promise<void>;
  deleteFolder(id: string): Promise<void>;
}
