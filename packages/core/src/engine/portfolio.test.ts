import { describe, it, expect } from "vitest";
import type { Model, Station, PartEntry } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { portfolioMatrix } from "./portfolio";

const prov = (id: string, provides: string[]): Station => ({
  id, name: id, role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 10,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides,
});
const part = (number: string, caps: string[], over: Partial<PartEntry> = {}): PartEntry => ({
  id: number, number, requiredCapabilityIds: caps, ...over,
});
const model = (stations: Station[], parts: PartEntry[]): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations, flows: [], noGoZones: [], parts,
});

describe("product-process feasibility matrix (audit C-11)", () => {
  it("is empty when there are no parts", () => {
    expect(portfolioMatrix(model([prov("s", ["cut.machining"])], [])).empty).toBe(true);
  });

  it("marks a part runnable when all its capabilities are provided", () => {
    const m = model([prov("s1", ["cut.machining", "join.weld"])], [part("P1", ["cut.machining", "join.weld"])]);
    const mx = portfolioMatrix(m);
    const row = mx.rows[0];
    expect(row.verdict).toBe("runnable");
    expect(row.cells["cut.machining"].status).toBe("provided");
    expect(mx.runnable).toBe(1);
  });

  it("covers a required capability through a catalog alternative (weld ⇄ bolt)", () => {
    const m = model([prov("s1", ["join.assemble"])], [part("P1", ["join.weld"])]);
    const cell = portfolioMatrix(m).rows[0].cells["join.weld"];
    expect(cell.status).toBe("alternative");
    expect(cell.via).toBe("join.assemble");
  });

  it("blocks a part on a missing capability and ranks the blocker", () => {
    const stations = [prov("s1", ["cut.machining"])];
    const parts = [
      part("P1", ["cut.machining", "mark.identify"]),
      part("P2", ["cut.machining", "mark.identify"]),
      part("P3", ["cut.machining"]),
    ];
    const mx = portfolioMatrix(model(stations, parts));
    expect(mx.runnable).toBe(1); // only P3
    expect(mx.rows.find((r) => r.number === "P1")!.verdict).toBe("blocked");
    expect(mx.rows.find((r) => r.number === "P1")!.missingNames).toContain("Marking / identification");
    // mark.identify blocks 2 of 3 parts → top of the investment priority
    expect(mx.blocking[0].id).toBe("mark.identify");
    expect(mx.blocking[0].blockedParts).toBe(2);
  });

  it("builds columns from both required and provided capabilities, counting demand", () => {
    const mx = portfolioMatrix(model([prov("s1", ["cut.machining"])], [part("P1", ["cut.machining"]), part("P2", ["cut.machining", "form.press"])]));
    const cut = mx.columns.find((c) => c.id === "cut.machining")!;
    expect(cut.provided).toBe(true);
    expect(cut.requiredByCount).toBe(2);
    const press = mx.columns.find((c) => c.id === "form.press")!;
    expect(press.provided).toBe(false);
    expect(press.requiredByCount).toBe(1);
    // a part that does not need a capability shows "not-required" there
    expect(mx.rows.find((r) => r.number === "P1")!.cells["form.press"].status).toBe("not-required");
  });
});
