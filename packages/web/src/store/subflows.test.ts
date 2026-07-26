import { describe, it, expect } from "vitest";
import type { Model, Station, Flow } from "@flowplan/core/model/types";
import { makeSubflow } from "./subflows";

const base = {
  w: 2, h: 2, fixed: false, auto: "manual" as const, autoOverride: null, operators: 1,
  changeoverMin: 0, ergoRisk: "low" as const, utilities: [], notes: "", capacityPerShift: 0, cycleTimeSec: 10,
};
const st = (id: string, x: number): Station => ({ ...base, id, name: id, role: "process", type: "machine", x, y: 0 });
const flow = (from: string, to: string): Flow => ({ from, to, volume: 100, unitCost: 0, transport: "manual", partWeightKg: 1, notes: "" });

// in → a → b → out, grouping {a, b}.
const MODEL: Model = {
  name: "t", gridW: 40, gridH: 14, noGoZones: [],
  stations: [
    { ...st("in", 0), role: "input", type: "store" },
    st("a", 5), st("b", 10),
    { ...st("out", 15), role: "output", type: "store" },
  ],
  flows: [flow("in", "a"), flow("a", "b"), flow("b", "out")],
};

describe("makeSubflow — automatic inputs/outputs", () => {
  it("derives ports from the flows crossing the selection boundary", () => {
    const sf = makeSubflow(MODEL, ["a", "b"], "Cell")!;
    expect(sf).not.toBeNull();
    // 'a' is fed from outside (in→a) ⇒ input; 'b' feeds outside (b→out) ⇒ output.
    expect(sf.inputs).toEqual(["a"]);
    expect(sf.outputs).toEqual(["b"]);
    // Only the internal flow is captured.
    expect(sf.flows.map((f) => `${f.from}->${f.to}`)).toEqual(["a->b"]);
  });

  it("falls back to internal endpoints when the selection is isolated", () => {
    // No flows crossing the boundary: a→b only, nothing in/out.
    const isolated: Model = { ...MODEL, flows: [flow("a", "b")] };
    const sf = makeSubflow(isolated, ["a", "b"], "Cell")!;
    expect(sf.inputs).toEqual(["a"]); // no internal predecessor
    expect(sf.outputs).toEqual(["b"]); // no internal successor
  });

  it("returns null for a group of one", () => {
    expect(makeSubflow(MODEL, ["a"], "x")).toBeNull();
  });
});
