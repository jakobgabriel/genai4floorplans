import type { Model } from "@flowplan/core/model/types";
import { wrapLooseCells, type Cell, type Concept, type Folder, type Workspace } from "../workspace";
import type { ScenarioMeta } from "../scenarios";
import type { StorageProvider } from "./StorageProvider";

export type FetchLike = typeof fetch;

// Cloud provider: maps each StorageProvider method to the REST API. Bound to one
// server Workspace id; the session cookie carries auth (credentials: "include").
// A FetchLike is injectable for tests.
export class ApiStorageProvider implements StorageProvider {
  constructor(
    private readonly workspaceId: string,
    private readonly baseUrl = "/api",
    // Default to a window-bound wrapper: the browser's `fetch` throws "Illegal
    // invocation" if called as a method (`this.fetchImpl(...)`) because it needs
    // `this === window`. Storing the bare `fetch` reference here silently broke
    // every workspace load/save and forced the app into offline localStorage.
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(this.baseUrl + path, {
      method,
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API ${method} ${path} failed: ${res.status}`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async loadWorkspace(): Promise<Workspace> {
    const { workspace } = await this.req<{
      workspace: {
        id: string;
        name: string;
        activeId: string | null;
        folders: (Folder & { archived?: boolean })[];
        concepts?: (Concept & { archived?: boolean })[];
        cells: { id: string; name: string; model: Model; folderId: string | null; conceptId?: string | null; archived?: boolean }[];
      };
    }>("GET", `/workspaces/${this.workspaceId}`);
    const migratedCells: Cell[] = workspace.cells.map((c) => ({ id: c.id, name: c.name, model: c.model, folderId: c.folderId ?? null, conceptId: c.conceptId ?? null, archived: c.archived }));
    // Wrap any loose layouts into concepts so the tree always has a concept level.
    const { cells, concepts } = wrapLooseCells(migratedCells, workspace.concepts ?? []);
    const activeId = cells.find((c) => c.id === workspace.activeId && !c.archived)?.id ?? cells.find((c) => !c.archived)?.id ?? cells[0]?.id ?? "";
    return { cells, concepts, folders: workspace.folders ?? [], activeId };
  }

  // One bulk reconcile of the whole Folder>Concept>Layout tree — the server
  // upserts everything by id (archived flag included, so the Archive round-trips)
  // and deletes what's gone. This is the DB-backed client's single save path, so
  // create/move/delete/archive of any node persists.
  async saveWorkspace(ws: Workspace): Promise<void> {
    await this.req("PUT", `/workspaces/${this.workspaceId}/tree`, {
      activeId: ws.activeId,
      folders: ws.folders.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId, position: f.position, archived: !!f.archived })),
      concepts: ws.concepts.map((c) => ({ id: c.id, name: c.name, folderId: c.folderId, position: c.position, archived: !!c.archived })),
      cells: ws.cells.map((c) => ({ id: c.id, name: c.name, conceptId: c.conceptId, folderId: c.folderId, position: 0, archived: !!c.archived, model: c.model })),
    });
  }
  async saveCell(cell: Cell): Promise<void> {
    await this.req("PUT", `/cells/${cell.id}`, { model: cell.model });
  }
  async createCell(cell: Cell): Promise<Cell> {
    const { cell: created } = await this.req<{ cell: Cell }>("POST", `/workspaces/${this.workspaceId}/cells`, { name: cell.name, model: cell.model, folderId: cell.folderId, conceptId: cell.conceptId });
    return created;
  }
  async renameCell(id: string, name: string): Promise<void> {
    await this.req("PATCH", `/cells/${id}`, { name });
  }
  async deleteCell(id: string): Promise<void> {
    await this.req("DELETE", `/cells/${id}`);
  }
  async moveCell(id: string, conceptId: string | null): Promise<void> {
    await this.req("PATCH", `/cells/${id}`, { conceptId });
  }
  async createConcept(concept: Concept): Promise<Concept> {
    const { concept: created } = await this.req<{ concept: Concept }>("POST", `/workspaces/${this.workspaceId}/concepts`, { name: concept.name, folderId: concept.folderId });
    return created;
  }
  async renameConcept(id: string, name: string): Promise<void> {
    await this.req("PATCH", `/concepts/${id}`, { name });
  }
  async moveConcept(id: string, folderId: string | null, position?: number): Promise<void> {
    await this.req("PATCH", `/concepts/${id}`, { folderId, position });
  }
  async deleteConcept(id: string): Promise<void> {
    await this.req("DELETE", `/concepts/${id}`);
  }
  async listScenarios(): Promise<ScenarioMeta[]> {
    const { scenarios } = await this.req<{ scenarios: { name: string; savedAt: string; folderId: string | null }[] }>("GET", `/workspaces/${this.workspaceId}/scenarios`);
    return scenarios.map((s) => ({ name: s.name, savedAt: new Date(s.savedAt).getTime(), folderId: s.folderId ?? null }));
  }
  async saveScenario(name: string, model: Model): Promise<void> {
    await this.req("PUT", `/workspaces/${this.workspaceId}/scenarios/${encodeURIComponent(name)}`, { model });
  }
  async loadScenario(name: string): Promise<Model | null> {
    try {
      const { model } = await this.req<{ model: Model }>("GET", `/workspaces/${this.workspaceId}/scenarios/${encodeURIComponent(name)}`);
      return model;
    } catch {
      return null;
    }
  }
  async deleteScenario(name: string): Promise<void> {
    await this.req("DELETE", `/workspaces/${this.workspaceId}/scenarios/${encodeURIComponent(name)}`);
  }
  async moveScenario(name: string, folderId: string | null): Promise<void> {
    await this.req("PATCH", `/workspaces/${this.workspaceId}/scenarios/${encodeURIComponent(name)}`, { folderId });
  }
  async createFolder(folder: Folder): Promise<Folder> {
    const { folder: created } = await this.req<{ folder: Folder }>("POST", `/workspaces/${this.workspaceId}/folders`, { name: folder.name, parentId: folder.parentId });
    return created;
  }
  async renameFolder(id: string, name: string): Promise<void> {
    await this.req("PATCH", `/folders/${id}`, { name });
  }
  async moveFolder(id: string, parentId: string | null, position?: number): Promise<void> {
    await this.req("PATCH", `/folders/${id}`, { parentId, position });
  }
  async deleteFolder(id: string): Promise<void> {
    await this.req("DELETE", `/folders/${id}`);
  }
}
