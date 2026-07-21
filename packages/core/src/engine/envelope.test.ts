import { describe, it, expect } from "vitest";
import type { Model, Station } from "../model/types";
import { SCHEMA_VERSION } from "../model/types";
import { layoutRealism } from "./envelope";
import { clearanceRect, clearanceBlocked } from "./geometry";

const st = (id: string, x: number, y: number, over: Partial<Station> = {}): Station => ({
  id, name: id, role: "process", type: "machine", x, y, w: 2, h: 2, fixed: false,
  auto: "manual", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 10,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", ...over,
});

const model = (stations: Station[], over: Partial<Model> = {}): Model => ({
  schemaVersion: SCHEMA_VERSION, name: "m", gridW: 20, gridH: 12, shiftHours: 8,
  stations, flows: [], noGoZones: [], ...over,
});

describe("clearance geometry (audit C-03)", () => {
  it("expands the footprint by per-side margins", () => {
    const r = clearanceRect({ x: 5, y: 5, w: 2, h: 2, clearance: { top: 1, right: 2, bottom: 0, left: 1 } });
    expect(r).toEqual({ x: 4, y: 4, w: 5, h: 3 });
  });
  it("flags a body sitting inside another's clearance, but allows overlapping clearances", () => {
    const a = { x: 5, y: 5, w: 2, h: 2, clearance: { top: 0, right: 2, bottom: 0, left: 0 } };
    const bBlocking = { x: 8, y: 5, w: 2, h: 2 }; // body inside a's right clearance (x 7..8)
    const bClear = { x: 10, y: 5, w: 2, h: 2 };
    expect(clearanceBlocked(a, bBlocking)).toBe(true);
    expect(clearanceBlocked(a, bClear)).toBe(false);
  });
});

describe("layoutRealism (audit C-03)", () => {
  it("produces no issues on a legacy model with no clearance/weight/capacity", () => {
    const r = layoutRealism(model([st("a", 2, 5), st("b", 6, 5)]));
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("flags a station standing in another's access clearance", () => {
    const a = st("a", 4, 5, { clearance: { top: 0, right: 2, bottom: 0, left: 0 } });
    const b = st("b", 7, 5); // body at x7..8, inside a's right clearance (x6..7)
    const r = layoutRealism(model([a, b]));
    expect(r.clearanceConflicts.length).toBe(1);
    expect(r.ok).toBe(false);
  });

  it("flags a station over the floor-load capacity", () => {
    const heavy = st("h", 4, 5, { w: 2, h: 2, weightKg: 5000 }); // 4 m² → 1250 kg/m²
    const r = layoutRealism(model([heavy], { floorLoadKgPerM2: 1000 }));
    expect(r.overloaded.length).toBe(1);
    expect(r.overloaded[0].loadKgPerM2).toBeCloseTo(1250, 0);
    expect(r.ok).toBe(false);
  });

  it("does not flag floor load when weight is within capacity", () => {
    const ok = st("o", 4, 5, { w: 2, h: 2, weightKg: 2000 }); // 500 kg/m²
    const r = layoutRealism(model([ok], { floorLoadKgPerM2: 1000 }));
    expect(r.overloaded).toEqual([]);
  });

  it("flags a process station boxed in with no path to the boundary", () => {
    // A center station ringed by blocking zones on all four sides.
    const center = st("c", 9, 5, { w: 2, h: 2 });
    const ring = [
      { x: 8, y: 4, w: 4, h: 1 }, // top
      { x: 8, y: 7, w: 4, h: 1 }, // bottom
      { x: 8, y: 4, w: 1, h: 4 }, // left
      { x: 11, y: 4, w: 1, h: 4 }, // right
    ];
    const r = layoutRealism(model([center], { noGoZones: ring }));
    expect(r.enclosed).toContain("c");
  });

  it("gives egress to a station open to the boundary", () => {
    const r = layoutRealism(model([st("a", 2, 5)]));
    expect(r.enclosed).toEqual([]);
  });
});

import { optimize } from "./optimize";

describe("optimizer respects access clearance (audit C-03)", () => {
  it("never leaves a clearance-blocked pair in its output", () => {
    // Two movable stations that both demand right/left clearance, plus flows that
    // would pull them together. The optimizer must keep the access clear.
    const grid = { gridW: 14, gridH: 8, noGoZones: [] };
    const a = st("a", 2, 3, { clearance: { top: 0, right: 2, bottom: 0, left: 0 } });
    const b = st("b", 8, 3, { clearance: { top: 0, right: 0, bottom: 0, left: 2 } });
    const flows = [{ from: "a", to: "b", volume: 1000, unitCost: 1, transport: "manual" as const, partWeightKg: 1, notes: "" }];
    const out = optimize([a, b], flows, grid);
    const r = layoutRealism(model(out, grid));
    expect(r.clearanceConflicts).toEqual([]);
  });
});
