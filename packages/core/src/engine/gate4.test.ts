import { describe, it, expect } from "vitest";
import type { Model, Station, WorkElement } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { gate4Balance } from "./gate4";

const step = (id: string): Station => ({
  id, name: id, role: "process", type: "manual", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 30,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides: [],
});
const el = (id: string, seconds: number, over: Partial<WorkElement> = {}): WorkElement => ({
  id, name: id, predecessors: [], time: { seconds, method: "estimate", confidence: "med" },
  classification: "VA", attendedFraction: 1, ergonomicLoad: "light", ...over,
});
// demand year units → takt = 6,336,000 / units.
const model = (over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations: [], flows: [], noGoZones: [], ...over,
});

describe("Gate 4 — balance (spec §18 Gate 4)", () => {
  it("has no data without a workload or a takt", () => {
    expect(gate4Balance(model()).hasData).toBe(false);
    expect(gate4Balance(model({ workElements: [el("e1", 20)] })).hasData).toBe(false); // no takt
  });

  it("passes when the workload fits the available stations", () => {
    // 100,000 units → takt 63.36s; two 30s elements → ~1 station min; 2 placed.
    const g = gate4Balance(model({
      stations: [step("s1"), step("s2")],
      workElements: [el("e1", 30), el("e2", 20)],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    expect(g.hasData).toBe(true);
    expect(g.feasible).toBe(true);
    expect(g.minStations).toBe(1);
  });

  it("blocks on an indivisible element that exceeds takt alone", () => {
    const g = gate4Balance(model({
      stations: [step("s1"), step("s2")],
      workElements: [el("e1", 90), el("e2", 20)],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    expect(g.feasible).toBe(false);
    expect(g.overTakt.map((e) => e.id)).toContain("e1");
  });

  it("blocks when the line has fewer stations than the minimum", () => {
    // takt 63.36s; total 5×60 = 300s → min ceil(300/63.36)=5 stations; only 2 placed.
    const g = gate4Balance(model({
      stations: [step("s1"), step("s2")],
      workElements: [el("a", 60), el("b", 60), el("c", 60), el("d", 60), el("e", 60)],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    expect(g.minStations).toBe(5);
    expect(g.availableStations).toBe(2);
    expect(g.understaffed).toBe(true);
    expect(g.feasible).toBe(false);
  });

  it("states the requirement without blocking when no stations are placed yet", () => {
    const g = gate4Balance(model({
      workElements: [el("a", 60), el("b", 60), el("c", 60)],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    expect(g.availableStations).toBe(0);
    expect(g.understaffed).toBe(false);
    expect(g.feasible).toBe(true);
    expect(g.requiredStations).toBeGreaterThan(0);
  });

  it("balances against the heaviest mode, not the average", () => {
    // One mode doubles element a → worst mode 2×60+20 = 140s vs avg lower.
    const g = gate4Balance(model({
      stations: [step("s1")],
      workElements: [el("a", 60), el("b", 20)],
      variantModes: [
        { id: "m1", name: "base", share: 0.5, elementOverrides: {} },
        { id: "m2", name: "heavy", share: 0.5, elementOverrides: { a: 3 } },
      ],
      demand: { years: [{ year: 2026, units: 100000 }] },
    }));
    // heavy mode: a=180s > 63.36s takt → over-takt block
    expect(g.feasible).toBe(false);
    expect(g.overTakt.some((e) => e.id === "a")).toBe(true);
  });
});
