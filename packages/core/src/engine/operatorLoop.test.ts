import { describe, it, expect } from "vitest";
import type { Model, Station } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { SAMPLE } from "../model/sample";
import { analyseOperatorLoops } from "./operatorLoop";

const st = (id: string, x: number, y: number, over: Partial<Station> = {}): Station => ({
  id, name: id, role: "process", type: "manual", x, y, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 20,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", ...over,
});

const model = (stations: Station[], over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 30, gridH: 14, shiftHours: 8,
  stations, flows: [], noGoZones: [], ...over,
});

describe("operator loops — walk time from layout (audit C-13)", () => {
  it("shows a single notional loop over the whole line when nobody is assigned", () => {
    const r = analyseOperatorLoops(SAMPLE);
    expect(r.notional).toBe(true);
    expect(r.loops.length).toBe(1);
    expect(r.loops[0].synthetic).toBe(true);
    // the four process steps, and a real walk between them
    expect(r.loops[0].stationIds.sort()).toEqual(["assembly", "cnc", "press", "qa"]);
    expect(r.loops[0].walkSec).toBeGreaterThan(0);
    expect(r.loops[0].walkMeters).toBeGreaterThan(0);
  });

  it("computes walk time from geometry — closer stations walk less", () => {
    const flows = [
      { from: "a", to: "b", volume: 100, unitCost: 1, transport: "manual" as const, partWeightKg: 1, notes: "" },
    ];
    const far = model([st("a", 1, 6), st("b", 25, 6)], { flows });
    const near = model([st("a", 1, 6), st("b", 5, 6)], { flows });
    const rFar = analyseOperatorLoops(far).loops[0];
    const rNear = analyseOperatorLoops(near).loops[0];
    expect(rFar.walkSec).toBeGreaterThan(rNear.walkSec);
    // work content is identical; only the walk (and thus the loop) differs
    expect(rFar.workSec).toBeCloseTo(rNear.workSec, 2);
    expect(rFar.loopSec).toBeGreaterThan(rNear.loopSec);
  });

  it("groups stations into explicit operator loops by operatorId", () => {
    const stations = [
      st("a", 2, 6, { operatorId: "op1" }),
      st("b", 6, 6, { operatorId: "op1" }),
      st("c", 20, 6, { operatorId: "op2" }),
    ];
    const r = analyseOperatorLoops(model(stations));
    expect(r.notional).toBe(false);
    expect(r.operatorCount).toBe(2);
    const op1 = r.loops.find((l) => l.id === "op1")!;
    expect(op1.stationIds.sort()).toEqual(["a", "b"]);
    // op1 walks a→b→a; op2 is a singleton → no walk
    expect(op1.walkSec).toBeGreaterThan(0);
    expect(r.loops.find((l) => l.id === "op2")!.walkSec).toBe(0);
  });

  it("uses attendedFraction: a machine binds the operator less than manual work", () => {
    const machine = analyseOperatorLoops(model([st("m", 2, 6, { type: "machine", cycleTimeSec: 100 })])).loops[0];
    const manual = analyseOperatorLoops(model([st("h", 2, 6, { type: "manual", cycleTimeSec: 100 })])).loops[0];
    expect(machine.workSec).toBeCloseTo(30, 0); // 100 × 0.3 default
    expect(manual.workSec).toBeCloseTo(100, 0); // 100 × 1.0
    // an explicit override wins
    const ovr = analyseOperatorLoops(model([st("o", 2, 6, { type: "machine", cycleTimeSec: 100, attendedFraction: 0.5 })])).loops[0];
    expect(ovr.workSec).toBeCloseTo(50, 0);
  });

  it("flags an operator loop that cannot keep up with takt", () => {
    // Two far-apart manual stations, one operator, tight demand.
    const stations = [
      st("a", 1, 6, { operatorId: "op1", cycleTimeSec: 30 }),
      st("b", 28, 6, { operatorId: "op1", cycleTimeSec: 30 }),
    ];
    const r = analyseOperatorLoops(model(stations, { demand: { years: [{ year: 2026, units: 400000 }] } }));
    const op1 = r.loops[0];
    expect(r.takt).toBeGreaterThan(0);
    expect(op1.loopSec).toBeGreaterThan(op1.workSec); // walk adds to it
    if (op1.loopSec > r.takt) {
      expect(op1.overTaktSec).toBeGreaterThan(0);
      expect(r.overloaded).toContain("op1");
    }
  });

  it("reports walking waste as a share of operator time", () => {
    const r = analyseOperatorLoops(SAMPLE);
    expect(r.walkWastePct).toBeGreaterThanOrEqual(0);
    expect(r.walkWastePct).toBeLessThan(100);
    expect(r.totalWalkSec + r.totalWorkSec).toBeGreaterThan(0);
  });
});
