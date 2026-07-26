import type { Model } from "@flowplan/core/model/types";
import type { Cell, Folder, Workspace } from "../workspace";
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
    private readonly fetchImpl: FetchLike = fetch,
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
        folders: Folder[];
        cells: { id: string; name: string; model: Model; folderId: string | null }[];
      };
    }>("GET", `/workspaces/${this.workspaceId}`);
    const cells: Cell[] = workspace.cells.map((c) => ({ id: c.id, name: c.name, model: c.model, folderId: c.folderId ?? null }));
    return { cells, folders: workspace.folders ?? [], activeId: workspace.activeId ?? cells[0]?.id ?? "" };
  }

  // The whole-workspace save is decomposed into per-cell saves + an activeId patch;
  // the autosave path prefers saveCell() directly to avoid write amplification.
  async saveWorkspace(ws: Workspace): Promise<void> {
    await Promise.all(ws.cells.map((c) => this.saveCell(c)));
    await this.req("PATCH", `/workspaces/${this.workspaceId}`, { activeId: ws.activeId });
  }
  async saveCell(cell: Cell): Promise<void> {
    await this.req("PUT", `/cells/${cell.id}`, { model: cell.model });
  }
  async createCell(cell: Cell): Promise<Cell> {
    const { cell: created } = await this.req<{ cell: Cell }>("POST", `/workspaces/${this.workspaceId}/cells`, { name: cell.name, model: cell.model, folderId: cell.folderId });
    return created;
  }
  async renameCell(id: string, name: string): Promise<void> {
    await this.req("PATCH", `/cells/${id}`, { name });
  }
  async deleteCell(id: string): Promise<void> {
    await this.req("DELETE", `/cells/${id}`);
  }
  async moveCell(id: string, folderId: string | null): Promise<void> {
    await this.req("PATCH", `/cells/${id}`, { folderId });
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
