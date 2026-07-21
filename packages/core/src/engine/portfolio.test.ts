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

import { portfolioCapacity } from "./portfolio";

describe("portfolio capacity gate — Gate 2/3 + drop (audit C-11)", () => {
  const line = (provides: string[], cycleTimeSec: number, over: Partial<Station> = {}): Station => ({
    ...prov("m", provides), cycleTimeSec, ...over,
  });

  it("has no data until parts carry demand and the line is priced", () => {
    const cap = portfolioCapacity(model([prov("s", ["cut.machining"])], [part("P1", ["cut.machining"])]));
    expect(cap.hasData).toBe(false);
  });

  it("computes utilization from processing + changeover against available time", () => {
    // default shift model: 220 × 1 × 8h × 3600 × 0.85 = 5,385,600 s/yr
    const stations = [line(["cut.machining"], 60)];
    const parts = [part("P1", ["cut.machining"], { demandPerYear: 50000 })];
    const cap = portfolioCapacity(model(stations, parts));
    expect(cap.hasData).toBe(true);
    expect(cap.processingSecPerYear).toBeCloseTo(50000 * 60, 0);
    expect(cap.utilizationPct).toBeGreaterThan(50);
    expect(cap.utilizationPct).toBeLessThan(60);
    expect(cap.overCapacity).toBe(false);
  });

  it("adds changeover time per campaign", () => {
    const stations = [line(["cut.machining"], 60, { changeoverMin: 120 })];
    const parts = [part("P1", ["cut.machining"], { demandPerYear: 10000, campaignsPerYear: 12 })];
    const cap = portfolioCapacity(model(stations, parts));
    // 12 campaigns × 120 min × 60 = 86,400 s of changeover
    expect(cap.changeoverSecPerYear).toBeCloseTo(12 * 120 * 60, 0);
    expect(cap.totalLoadSecPerYear).toBeCloseTo(cap.processingSecPerYear + cap.changeoverSecPerYear, 0);
  });

  it("flags over-capacity and proposes which part to drop", () => {
    const stations = [line(["cut.machining"], 60)];
    const parts = [
      part("P1", ["cut.machining"], { demandPerYear: 60000 }),
      part("P2", ["cut.machining"], { demandPerYear: 60000 }),
    ];
    const cap = portfolioCapacity(model(stations, parts));
    // 120,000 × 60 = 7,200,000 > 5,385,600 → over
    expect(cap.overCapacity).toBe(true);
    expect(cap.drop.length).toBeGreaterThanOrEqual(1);
    expect(cap.drop[0].freedSecPerYear).toBeGreaterThan(0);
  });

  it("marks a part off its validated volume band (Gate 2)", () => {
    const stations = [line(["cut.machining"], 60, { volumeBand: { minUnitsPerYear: 1000, maxUnitsPerYear: 20000 } })];
    const parts = [part("P1", ["cut.machining"], { demandPerYear: 50000 })];
    const cap = portfolioCapacity(model(stations, parts));
    expect(cap.parts[0].offVolume).toBe(true);
  });
});
