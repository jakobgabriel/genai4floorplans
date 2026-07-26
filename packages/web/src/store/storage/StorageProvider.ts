import type { Model } from "@flowplan/core/model/types";
import type { Cell, Concept, Folder, Workspace } from "../workspace";
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
  /** Move a layout into another concept. */
  moveCell(id: string, conceptId: string | null): Promise<void>;
  // ---- concepts (the workspace item; holds layouts) ----
  createConcept(concept: Concept): Promise<Concept>;
  renameConcept(id: string, name: string): Promise<void>;
  moveConcept(id: string, folderId: string | null, position?: number): Promise<void>;
  /** Delete a concept and its layouts (a layout can't exist without a concept). */
  deleteConcept(id: string): Promise<void>;
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
