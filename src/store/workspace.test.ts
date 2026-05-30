// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { loadWorkspace, saveWorkspace, makeCell } from "./workspace";
import { SAMPLE } from "../model/sample";
import { SCHEMA_VERSION } from "../model/types";

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

  it("migrates a legacy single-cell autosave into a cell", () => {
    localStorage.setItem("flowplan_model", JSON.stringify({ ...SAMPLE, schemaVersion: undefined }));
    const ws = loadWorkspace();
    expect(ws.cells).toHaveLength(1);
    expect(ws.cells[0].model.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("round-trips multiple cells through localStorage", () => {
    const ws = { cells: [makeCell("A", SAMPLE), makeCell("B", SAMPLE)], activeId: "" };
    ws.activeId = ws.cells[1].id;
    saveWorkspace(ws);
    const back = loadWorkspace();
    expect(back.cells).toHaveLength(2);
    expect(back.activeId).toBe(ws.cells[1].id);
    expect(back.cells[1].name).toBe("B");
  });
});
