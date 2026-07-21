import { describe, it, expect } from "vitest";
import type { Model, Station } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { modelDiff } from "./diff";

const st = (id: string, over: Partial<Station> = {}): Station => ({
  id, name: id, role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 30,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", ...over,
});
const model = (stations: Station[], over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations, flows: [], noGoZones: [], ...over,
});

describe("modelDiff (audit C-10)", () => {
  it("reports no change for identical models", () => {
    const m = model([st("a"), st("b")]);
    const d = modelDiff(m, m);
    expect(d.changed).toBe(false);
    expect(d.summary).toBe("No differences.");
  });

  it("detects an added and a removed station", () => {
    const a = model([st("a"), st("b")]);
    const b = model([st("a"), st("c")]);
    const d = modelDiff(a, b);
    expect(d.stationsAdded).toBe(1);
    expect(d.stationsRemoved).toBe(1);
    expect(d.stations.find((s) => s.id === "c")!.kind).toBe("added");
    expect(d.stations.find((s) => s.id === "b")!.kind).toBe("removed");
    expect(d.summary).toContain("1 station added");
  });

  it("detects field-level changes on a station with from/to", () => {
    const a = model([st("a", { x: 1, y: 1, cycleTimeSec: 30, operators: 1 })]);
    const b = model([st("a", { x: 5, y: 1, cycleTimeSec: 45, operators: 0.5 })]);
    const d = modelDiff(a, b);
    const chg = d.stations.find((s) => s.id === "a")!;
    expect(chg.kind).toBe("changed");
    const fields = Object.fromEntries(chg.fields.map((f) => [f.field, `${f.from}→${f.to}`]));
    expect(fields["position"]).toBe("(1,1)→(5,1)");
    expect(fields["cycle"]).toBe("30s→45s");
    expect(fields["operators"]).toBe("1→0.5");
  });

  it("detects flow add / remove / change and grid change", () => {
    const a = model([st("a"), st("b")], {
      flows: [{ from: "a", to: "b", volume: 100, unitCost: 1, transport: "manual", partWeightKg: 1, notes: "" }],
    });
    const b = model([st("a"), st("b")], {
      gridW: 24,
      flows: [{ from: "a", to: "b", volume: 200, unitCost: 1, transport: "conveyor", partWeightKg: 1, notes: "" }],
    });
    const d = modelDiff(a, b);
    expect(d.flowsChanged).toBe(1);
    expect(d.flowsAdded).toBe(0);
    expect(d.gridChanged).toBe(true);
    expect(d.gridTo).toBe("24×12");
  });
});
