import { describe, it, expect } from "vitest";
import type { Model, Flow, Station } from "../model/types";
import { guardrailCheck } from "./guardrails";

function station(id: string, x: number, y: number, over: Partial<Station> = {}): Station {
  return {
    id, name: id.toUpperCase(), role: "process", type: "machine",
    x, y, w: 2, h: 2, fixed: false, auto: "manual", autoOverride: null,
    capacityPerShift: 1000, operators: 1, cycleTimeSec: 30, changeoverMin: 0,
    ergoRisk: "low", utilities: [], notes: "", ...over,
  };
}
function flow(from: string, to: string, kind?: Flow["kind"]): Flow {
  return { from, to, volume: 100, unitCost: 0.05, transport: "manual", partWeightKg: 1, notes: "", kind };
}
function model(stations: Station[], flows: Flow[]): Model {
  return { schemaVersion: 10, name: "G", gridW: 20, gridH: 20, stations, flows, noGoZones: [] };
}

describe("guardrails — good/reject separation (blueprint §10)", () => {
  it("flags a reject leaving in the same direction as the good part", () => {
    // test at (5,5); good to (10,5) [east], reject also to (14,5) [east] → same dir.
    const m = model(
      [station("test", 5, 5, { type: "quality" }), station("good", 10, 5), station("scrap", 14, 5)],
      [flow("test", "good", "good"), flow("test", "scrap", "nok")],
    );
    const f = guardrailCheck(m);
    expect(f.some((x) => x.id.startsWith("sep:") && x.severity === "error")).toBe(true);
  });

  it("passes when the reject leaves in a different direction", () => {
    // good east (10,5), reject south (5,14) → orthogonal, separated.
    const m = model(
      [station("test", 5, 5, { type: "quality" }), station("good", 10, 5), station("scrap", 5, 14)],
      [flow("test", "good", "good"), flow("test", "scrap", "nok")],
    );
    const f = guardrailCheck(m);
    expect(f.some((x) => x.id.startsWith("sep:"))).toBe(false);
  });

  it("warns when rejects are modelled but no quality station gates the outfeed", () => {
    const m = model(
      [station("p", 5, 5), station("out", 10, 5, { role: "output" }), station("scrap", 5, 14)],
      [flow("p", "out", "good"), flow("p", "scrap", "nok")],
    );
    const f = guardrailCheck(m);
    expect(f.some((x) => x.id === "contract:test")).toBe(true);
  });

  it("is silent on a plain good-only cell", () => {
    const m = model([station("a", 5, 5), station("b", 10, 5)], [flow("a", "b")]);
    expect(guardrailCheck(m)).toHaveLength(0);
  });
});
