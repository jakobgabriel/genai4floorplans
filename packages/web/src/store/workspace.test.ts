// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadWorkspace, saveWorkspace, makeCell, makeConcept, makeFolder, isDescendant, subtreeFolderIds, wrapLooseCells } from "./workspace";
import { SAMPLE } from "@flowplan/core/model/sample";
import { SCHEMA_VERSION } from "@flowplan/core/model/types";

beforeEach(() => {
  localStorage.clear();
  localStorage.removeItem("flowplan_workspace");
  localStorage.removeItem("flowplan_model");
});

describe("workspace", () => {
  it("seeds a single cell on first run", () => {
    localStorage.clear();
    const ws = loadWorkspace();
    expect(ws.cells).toHaveLength(1);
    expect(ws.activeId).toBe(ws.cells[0].id);
  });

  it("migrates a legacy single-cell autosave into a cell (root folder)", () => {
    localStorage.setItem("flowplan_model", JSON.stringify({ ...SAMPLE, schemaVersion: undefined }));
    const ws = loadWorkspace();
    expect(ws.cells).toHaveLength(1);
    expect(ws.cells[0].model.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ws.cells[0].folderId).toBeNull();
    expect(ws.folders).toEqual([]);
  });

  it("defaults folders/folderId on a legacy blob without them", () => {
    // a pre-folders workspace blob: cells without folderId, no folders array
    localStorage.setItem(
      "flowplan_workspace",
      JSON.stringify({ cells: [{ id: "c1", name: "A", model: SAMPLE }], activeId: "c1" }),
    );
    const ws = loadWorkspace();
    expect(ws.folders).toEqual([]);
    expect(ws.cells[0].folderId).toBeNull();
  });

  it("round-trips cells and nested folders through localStorage", () => {
    const root = makeFolder("Line 1", null, 0);
    const sub = makeFolder("Station group", root.id, 0);
    const ws = {
      cells: [makeCell("A", SAMPLE, sub.id), makeCell("B", SAMPLE)],
      concepts: [],
      folders: [root, sub],
      activeId: "",
    };
    ws.activeId = ws.cells[1].id;
    saveWorkspace(ws);
    const back = loadWorkspace();
    expect(back.cells).toHaveLength(2);
    expect(back.folders).toHaveLength(2);
    expect(back.cells[0].folderId).toBe(sub.id);
    expect(back.activeId).toBe(ws.cells[1].id);
  });

  it("subtreeFolderIds collects a folder and all its descendants", () => {
    const a = makeFolder("A", null, 0);
    const b = makeFolder("B", a.id, 0);
    const c = makeFolder("C", b.id, 0);
    const other = makeFolder("Other", null, 1);
    const ids = subtreeFolderIds([a, b, c, other], a.id);
    expect([...ids].sort()).toEqual([a.id, b.id, c.id].sort());
    expect(ids.has(other.id)).toBe(false);
  });

  it("round-trips the archived flag through localStorage", () => {
    const ws = {
      cells: [makeCell("Live", SAMPLE), { ...makeCell("Gone", SAMPLE), archived: true }],
      concepts: [],
      folders: [{ ...makeFolder("Old", null, 0), archived: true }],
      activeId: "",
    };
    ws.activeId = ws.cells[0].id;
    saveWorkspace(ws);
    const back = loadWorkspace();
    expect(back.cells.find((c) => c.name === "Gone")!.archived).toBe(true);
    expect(back.cells.find((c) => c.name === "Live")!.archived).toBe(false);
    expect(back.folders[0].archived).toBe(true);
  });

  it("wraps legacy loose cells into a concept each", () => {
    const cells = [makeCell("A", SAMPLE, null), makeCell("B", SAMPLE, "f2")];
    const { cells: wrapped, concepts } = wrapLooseCells(cells, []);
    // Every cell now belongs to a concept, in its own folder.
    expect(wrapped.every((c) => c.conceptId)).toBe(true);
    expect(concepts).toHaveLength(2);
    expect(concepts.find((k) => k.id === wrapped[0].conceptId)!.folderId).toBeNull();
    expect(concepts.find((k) => k.id === wrapped[1].conceptId)!.folderId).toBe("f2");
  });

  it("preserves cells already attached to a known concept", () => {
    const concept = makeConcept("Keep", null, 0);
    const cell = { ...makeCell("A", SAMPLE, null), conceptId: concept.id };
    const { cells, concepts } = wrapLooseCells([cell], [concept]);
    expect(concepts).toHaveLength(1); // no new concept minted
    expect(cells[0].conceptId).toBe(concept.id);
  });

  it("seeds a concept + layout on first run", () => {
    localStorage.clear();
    const ws = loadWorkspace();
    expect(ws.concepts).toHaveLength(1);
    expect(ws.cells[0].conceptId).toBe(ws.concepts[0].id);
  });

  it("migrates a saved workspace with loose cells into concepts", () => {
    localStorage.setItem(
      "flowplan_workspace",
      JSON.stringify({ cells: [{ id: "c1", name: "A", model: SAMPLE, folderId: null }], activeId: "c1" }),
    );
    const ws = loadWorkspace();
    expect(ws.concepts).toHaveLength(1);
    expect(ws.cells[0].conceptId).toBe(ws.concepts[0].id);
  });

  it("isDescendant guards folder-move cycles", () => {
    const a = makeFolder("A", null, 0);
    const b = makeFolder("B", a.id, 0);
    const c = makeFolder("C", b.id, 0);
    const folders = [a, b, c];
    // moving A under C would cycle (C is a descendant of A)
    expect(isDescendant(folders, a.id, c.id)).toBe(true);
    // moving C under A is fine (A is not a descendant of C)
    expect(isDescendant(folders, c.id, a.id)).toBe(false);
  });
});
