import { describe, it, expect } from "vitest";
import type { Model, Station } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { cyclePercentiles, lineVariability } from "./variability";

const st = (id: string, cycleTimeSec: number, over: Partial<Station> = {}): Station => ({
  id, name: id, role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", provides: [], ...over,
});
const model = (stations: Station[], over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations, flows: [], noGoZones: [], ...over,
});

describe("cycle-time variability (audit C-09)", () => {
  it("is deterministic when no CV is given (percentiles equal the mean)", () => {
    const p = cyclePercentiles(st("s", 45), 50);
    expect(p.cv).toBe(0);
    expect(p.p50Sec).toBe(45);
    expect(p.p95Sec).toBe(45);
    expect(p.p99Sec).toBe(45);
    expect(p.fragile).toBe(false);
    expect(p.taktAttainment).toBe(1); // mean 45 ≤ takt 50
  });

  it("produces a right-skewed lognormal spread: p50 < mean < p95 < p99", () => {
    const p = cyclePercentiles(st("s", 45, { cycleCV: 0.2 }), 50);
    expect(p.p50Sec).toBeLessThan(p.meanSec);
    expect(p.meanSec).toBeLessThan(p.p95Sec);
    expect(p.p95Sec).toBeLessThan(p.p99Sec);
    // sanity against hand computation (mean 45, cv 0.2)
    expect(p.p95Sec).toBeGreaterThan(58);
    expect(p.p95Sec).toBeLessThan(64);
  });

  it("flags a station fragile when the mean clears takt but p95 does not", () => {
    const p = cyclePercentiles(st("s", 45, { cycleCV: 0.2 }), 50);
    expect(p.meanSec).toBeLessThanOrEqual(50);
    expect(p.p95Sec).toBeGreaterThan(50);
    expect(p.fragile).toBe(true);
    expect(p.taktAttainment).toBeGreaterThan(0);
    expect(p.taktAttainment).toBeLessThan(1);
  });

  it("is not fragile when even p95 clears takt", () => {
    const p = cyclePercentiles(st("s", 30, { cycleCV: 0.1 }), 60);
    expect(p.p95Sec).toBeLessThan(60);
    expect(p.fragile).toBe(false);
    expect(p.taktAttainment).toBeGreaterThan(0.99);
  });

  it("has no line data until a process station carries a CV", () => {
    const lv = lineVariability(model([st("a", 40), st("b", 30)], { demand: { years: [{ year: 2026, units: 100000 }] } }));
    expect(lv.hasData).toBe(false);
    expect(lv.taktSec).toBeGreaterThan(0);
  });

  it("picks the mean bottleneck and reports its p95 as the line tail pace", () => {
    const lv = lineVariability(model(
      [st("fast", 30, { cycleCV: 0.15 }), st("slow", 55, { cycleCV: 0.2 })],
      { demand: { years: [{ year: 2026, units: 100000 }] } }, // takt 63.36s
    ));
    expect(lv.hasData).toBe(true);
    expect(lv.bottleneckId).toBe("slow");
    expect(lv.p95PaceSec).toBeGreaterThan(55); // p95 above the mean
  });

  it("compounds per-station attainment into a line probability (independent approx)", () => {
    const lv = lineVariability(model(
      [st("a", 45, { cycleCV: 0.2 }), st("b", 45, { cycleCV: 0.2 })],
      { demand: { years: [{ year: 2026, units: 126720 }] } }, // takt 50s
    ));
    const single = lv.stations[0].taktAttainment!;
    // two independent stations → product is lower than either alone
    expect(lv.lineTaktAttainment).toBeCloseTo(single * single, 3);
    expect(lv.lineTaktAttainment!).toBeLessThan(single);
    expect(lv.fragileStations.length).toBe(2);
  });
});
