// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { blankModel } from "@flowplan/core/model/sample";
import type { Model } from "@flowplan/core/model/types";
import { LocalStorageProvider } from "./LocalStorageProvider";
import { ApiStorageProvider, type FetchLike } from "./ApiStorageProvider";
import type { StorageProvider } from "./StorageProvider";

// A tiny in-memory API stand-in so the ApiStorageProvider can be exercised with
// the exact same assertions as the LocalStorageProvider — the contract both must
// satisfy. Models stored/returned round-trip through JSON like the real server.
function fakeApi(): FetchLike {
  const cells = new Map<string, { id: string; name: string; model: Model; folderId: string | null }>();
  const folders = new Map<string, { id: string; name: string; parentId: string | null; position: number }>();
  const scenarios = new Map<string, { model: Model; folderId: string | null }>();
  let activeId: string | null = null;
  let counter = 0;

  return (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = url.replace(/^\/api/, "");
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const json = (data: unknown, status = 200) => ({ ok: status < 400, status, async json() { return data; }, async text() { return ""; } }) as unknown as Response;

    // workspaces/:id (GET hydrate, PATCH activeId)
    if (/^\/workspaces\/[^/]+$/.test(path) && method === "GET") {
      return json({ workspace: { id: "w1", name: "WS", activeId, folders: Array.from(folders.values()), cells: Array.from(cells.values()) } });
    }
    if (/^\/workspaces\/[^/]+$/.test(path) && method === "PATCH") {
      if (body.activeId !== undefined) activeId = body.activeId;
      return json({ workspace: { id: "w1", activeId } });
    }
    // cells collection (POST create)
    if (/^\/workspaces\/[^/]+\/cells$/.test(path) && method === "POST") {
      const id = "c" + ++counter;
      const cell = { id, name: body.name, model: body.model, folderId: body.folderId ?? null };
      cells.set(id, cell);
      activeId = id;
      return json({ cell }, 201);
    }
    // cells/:id (PUT save, PATCH rename/move, DELETE)
    const cellMatch = path.match(/^\/cells\/([^/]+)$/);
    if (cellMatch) {
      const id = cellMatch[1];
      if (method === "PUT") {
        const existing = cells.get(id) ?? { id, name: "Cell", model: body.model, folderId: null };
        cells.set(id, { ...existing, model: body.model });
        return json({ cell: cells.get(id), rating: { letter: "A", composite: 90 } });
      }
      if (method === "PATCH") {
        const c = cells.get(id)!;
        cells.set(id, { ...c, name: body.name ?? c.name, folderId: body.folderId !== undefined ? body.folderId : c.folderId });
        return json({ cell: cells.get(id) });
      }
      if (method === "DELETE") {
        cells.delete(id);
        return json(undefined, 204);
      }
    }
    // folders collection (POST create)
    if (/^\/workspaces\/[^/]+\/folders$/.test(path) && method === "POST") {
      const id = "f" + ++counter;
      const parentId = body.parentId ?? null;
      const position = Array.from(folders.values()).filter((f) => f.parentId === parentId).length;
      const folder = { id, name: body.name, parentId, position };
      folders.set(id, folder);
      return json({ folder }, 201);
    }
    // folders/:id (PATCH rename/move, DELETE reparent)
    const folderMatch = path.match(/^\/folders\/([^/]+)$/);
    if (folderMatch) {
      const id = folderMatch[1];
      if (method === "PATCH") {
        const f = folders.get(id)!;
        folders.set(id, { ...f, name: body.name ?? f.name, parentId: body.parentId !== undefined ? body.parentId : f.parentId });
        return json({ folder: folders.get(id) });
      }
      if (method === "DELETE") {
        const up = folders.get(id)?.parentId ?? null;
        folders.delete(id);
        for (const f of folders.values()) if (f.parentId === id) folders.set(f.id, { ...f, parentId: up });
        for (const c of cells.values()) if (c.folderId === id) cells.set(c.id, { ...c, folderId: up });
        return json(undefined, 204);
      }
    }
    // scenarios
    if (/\/scenarios$/.test(path) && method === "GET") {
      return json({ scenarios: Array.from(scenarios.entries()).map(([name, s]) => ({ name, savedAt: new Date().toISOString(), folderId: s.folderId })) });
    }
    const scMatch = path.match(/\/scenarios\/([^/]+)$/);
    if (scMatch) {
      const name = decodeURIComponent(scMatch[1]);
      if (method === "PUT") {
        scenarios.set(name, { model: body.model, folderId: scenarios.get(name)?.folderId ?? null });
        return json({ scenario: { name, savedAt: new Date().toISOString(), folderId: scenarios.get(name)!.folderId } });
      }
      if (method === "PATCH") {
        const s = scenarios.get(name)!;
        scenarios.set(name, { ...s, folderId: body.folderId });
        return json({ scenario: { name, savedAt: new Date().toISOString(), folderId: body.folderId } });
      }
      if (method === "GET") {
        if (!scenarios.has(name)) return json({ error: "not found" }, 404);
        return json({ model: scenarios.get(name)!.model });
      }
      if (method === "DELETE") {
        scenarios.delete(name);
        return json(undefined, 204);
      }
    }
    return json({ error: "unhandled " + method + " " + path }, 500);
  }) as unknown as FetchLike;
}

function runContract(name: string, make: () => StorageProvider) {
  describe(`StorageProvider contract — ${name}`, () => {
    beforeEach(() => localStorage.clear());

    it("creates, saves, renames and deletes a cell", async () => {
      const sp = make();
      const created = await sp.createCell({ id: "seed", name: "Alpha", folderId: null, model: { ...blankModel(), name: "Alpha" } });
      expect(created.name).toBe("Alpha");

      await sp.saveCell({ ...created, model: { ...created.model, gridW: 33 } });
      await sp.renameCell(created.id, "Beta");

      const ws = await sp.loadWorkspace();
      const found = ws.cells.find((c) => c.id === created.id)!;
      expect(found.name).toBe("Beta");
      expect(found.model.gridW).toBe(33);

      await sp.deleteCell(created.id);
      const after = await sp.loadWorkspace();
      expect(after.cells.find((c) => c.id === created.id)).toBeUndefined();
    });

    it("round-trips scenarios by name", async () => {
      const sp = make();
      await sp.saveScenario("Baseline", { ...blankModel(), name: "Baseline", gridW: 41 });
      const list = await sp.listScenarios();
      expect(list.some((s) => s.name === "Baseline")).toBe(true);

      const loaded = await sp.loadScenario("Baseline");
      expect(loaded?.gridW).toBe(41);
      expect(await sp.loadScenario("missing")).toBeNull();

      await sp.deleteScenario("Baseline");
      expect((await sp.listScenarios()).some((s) => s.name === "Baseline")).toBe(false);
    });

    it("creates nested folders and moves a cell into one", async () => {
      const sp = make();
      const root = await sp.createFolder({ id: "", name: "Line 1", parentId: null, position: 0 });
      const sub = await sp.createFolder({ id: "", name: "Sub", parentId: root.id, position: 0 });
      const cell = await sp.createCell({ id: "seed", name: "Layout", folderId: null, model: blankModel() });

      await sp.moveCell(cell.id, sub.id);
      let ws = await sp.loadWorkspace();
      expect(ws.folders).toHaveLength(2);
      expect(ws.cells.find((c) => c.id === cell.id)!.folderId).toBe(sub.id);

      // deleting the sub-folder reparents its cell up to the root folder
      await sp.deleteFolder(sub.id);
      ws = await sp.loadWorkspace();
      expect(ws.folders.find((f) => f.id === sub.id)).toBeUndefined();
      expect(ws.cells.find((c) => c.id === cell.id)!.folderId).toBe(root.id);
    });

    it("moves a scenario into a folder", async () => {
      const sp = make();
      const f = await sp.createFolder({ id: "", name: "Variants", parentId: null, position: 0 });
      await sp.saveScenario("Opt A", { ...blankModel(), name: "Opt A" });
      await sp.moveScenario("Opt A", f.id);
      const list = await sp.listScenarios();
      expect(list.find((s) => s.name === "Opt A")!.folderId).toBe(f.id);
    });
  });
}

runContract("local", () => new LocalStorageProvider());
runContract("api", () => new ApiStorageProvider("w1", "/api", fakeApi()));
