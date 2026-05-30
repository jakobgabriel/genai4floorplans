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
  const cells = new Map<string, { id: string; name: string; model: Model }>();
  const scenarios = new Map<string, Model>();
  let activeId: string | null = null;
  let counter = 0;

  return (async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = url.replace(/^\/api/, "");
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const json = (data: unknown, status = 200) => ({ ok: status < 400, status, async json() { return data; }, async text() { return ""; } }) as unknown as Response;

    // workspaces/:id (GET hydrate, PATCH activeId)
    if (/^\/workspaces\/[^/]+$/.test(path) && method === "GET") {
      return json({ workspace: { id: "w1", name: "WS", activeId, cells: Array.from(cells.values()) } });
    }
    if (/^\/workspaces\/[^/]+$/.test(path) && method === "PATCH") {
      if (body.activeId !== undefined) activeId = body.activeId;
      return json({ workspace: { id: "w1", activeId } });
    }
    // cells collection (POST create)
    if (/^\/workspaces\/[^/]+\/cells$/.test(path) && method === "POST") {
      const id = "c" + ++counter;
      const cell = { id, name: body.name, model: body.model };
      cells.set(id, cell);
      activeId = id;
      return json({ cell }, 201);
    }
    // cells/:id (PUT save, PATCH rename, DELETE)
    const cellMatch = path.match(/^\/cells\/([^/]+)$/);
    if (cellMatch) {
      const id = cellMatch[1];
      if (method === "PUT") {
        const existing = cells.get(id) ?? { id, name: "Cell", model: body.model };
        cells.set(id, { ...existing, model: body.model });
        return json({ cell: cells.get(id), rating: { letter: "A", composite: 90 } });
      }
      if (method === "PATCH") {
        const c = cells.get(id)!;
        cells.set(id, { ...c, name: body.name ?? c.name });
        return json({ cell: cells.get(id) });
      }
      if (method === "DELETE") {
        cells.delete(id);
        return json(undefined, 204);
      }
    }
    // scenarios
    if (/\/scenarios$/.test(path) && method === "GET") {
      return json({ scenarios: Array.from(scenarios.keys()).map((name) => ({ name, savedAt: new Date().toISOString() })) });
    }
    const scMatch = path.match(/\/scenarios\/([^/]+)$/);
    if (scMatch) {
      const name = decodeURIComponent(scMatch[1]);
      if (method === "PUT") {
        scenarios.set(name, body.model);
        return json({ scenario: { name, savedAt: new Date().toISOString() } });
      }
      if (method === "GET") {
        if (!scenarios.has(name)) return json({ error: "not found" }, 404);
        return json({ model: scenarios.get(name) });
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
      const created = await sp.createCell({ id: "seed", name: "Alpha", model: { ...blankModel(), name: "Alpha" } });
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
  });
}

runContract("local", () => new LocalStorageProvider());
runContract("api", () => new ApiStorageProvider("w1", "/api", fakeApi()));
