import { describe, it, expect } from "vitest";
import type { Flow, Model, Station } from "../model/types";
import { STATION_DEFAULTS, FLOW_DEFAULTS } from "../model/defaults";
import { SAMPLE } from "../model/sample";
import { balanceAnalysis } from "./balance";

function st(over: Partial<Station> & { id: string }): Station {
  return { ...STATION_DEFAULTS, ...over };
}
function fl(from: string, to: string, over: Partial<Flow> = {}): Flow {
  return { ...FLOW_DEFAULTS, from, to, ...over };
}

describe("parallel units (×N)", () => {
  it("raises line output when an extra lane is added at the bottleneck", () => {
    const base = balanceAnalysis(SAMPLE.stations, SAMPLE.flows, SAMPLE.shiftHours);
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, parallelUnits: 2 } : s));
    const out = balanceAnalysis(stations, SAMPLE.flows, SAMPLE.shiftHours);
    expect(out.lineOut).toBeGreaterThan(base.lineOut);
  });
});

describe("distribute split across parallel lanes", () => {
  const lane = (id: string) => st({ id, role: "process", cycleTimeSec: 0, capacityPerShift: 500 });
  const model = (lanes: string[]): Model => ({
    name: "t",
    gridW: 22,
    gridH: 14,
    stations: [
      st({ id: "in", role: "input", capacityPerShift: 100000 }),
      ...lanes.map(lane),
      st({ id: "out", role: "output", capacityPerShift: 100000 }),
    ],
    flows: [...lanes.map((l) => fl("in", l)), ...lanes.map((l) => fl(l, "out"))],
    noGoZones: [],
  });

  it("two lanes carry roughly double a single lane", () => {
    const one = balanceAnalysis(model(["a"]).stations, model(["a"]).flows);
    const two = balanceAnalysis(model(["a", "b"]).stations, model(["a", "b"]).flows);
    expect(one.lineOut).toBe(500);
    expect(two.lineOut).toBe(1000);
  });
});

describe("assemble merge (synchronized)", () => {
  const model: Model = {
    name: "t",
    gridW: 22,
    gridH: 14,
    stations: [
      st({ id: "fast", role: "input", capacityPerShift: 600 }),
      st({ id: "slow", role: "input", capacityPerShift: 300 }),
      st({ id: "asm", role: "process", cycleTimeSec: 0, capacityPerShift: 100000, mergeMode: "assemble" }),
      st({ id: "out", role: "output", capacityPerShift: 100000 }),
    ],
    flows: [fl("fast", "asm"), fl("slow", "asm"), fl("asm", "out")],
    noGoZones: [],
  };

  it("is paced by the slowest feeder and flags the idle branch", () => {
    const bal = balanceAnalysis(model.stations, model.flows);
    expect(bal.lineOut).toBe(300);
    expect(bal.syncWaits).toHaveLength(1);
    const w = bal.syncWaits[0];
    expect(w.bindingId).toBe("slow");
    expect(w.waiters[0].id).toBe("fast");
    expect(w.waiters[0].idle).toBe(300);
  });
});

describe("critical path", () => {
  it("follows the longest cumulative-cycle route on the SAMPLE line", () => {
    const bal = balanceAnalysis(SAMPLE.stations, SAMPLE.flows, SAMPLE.shiftHours);
    expect(bal.criticalPath).toEqual(["raw", "cnc", "press", "assembly", "qa"]);
  });
});
