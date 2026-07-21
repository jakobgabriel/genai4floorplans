import { describe, it, expect } from "vitest";
import { balanceAnalysis, stationRate } from "./balance";
import { cycleAnalysis } from "./cycle";
import { partsPerCycleOf, type Station, type Flow } from "../model/types";

const base = {
  x: 0, y: 0, w: 2, h: 2, fixed: false, auto: "manual" as const, autoOverride: null,
  operators: 1, changeoverMin: 0, ergoRisk: "low" as const, utilities: [], notes: "", capacityPerShift: 0,
};
const st = (o: Partial<Station> & Pick<Station, "id" | "name" | "role" | "type">): Station => ({ ...base, cycleTimeSec: 0, ...o });
const flow = (from: string, to: string): Flow => ({ from, to, volume: 1000, unitCost: 0, transport: "manual", partWeightKg: 1, notes: "" });

// A step that runs several parts in one cycle (a multi-cavity die / batch
// fixture) multiplies part throughput at the same cycle time. Example from the
// brief: step 1 = 1 part, step 2 = 4 parts/cycle, step 3 = 1 part.
const STATIONS: Station[] = [
  st({ id: "in", name: "In", role: "input", type: "store", operators: 0 }),
  st({ id: "a", name: "Step1", role: "process", type: "machine", cycleTimeSec: 40, partsPerCycle: 1 }),
  st({ id: "b", name: "Step2", role: "process", type: "machine", cycleTimeSec: 40, partsPerCycle: 4 }),
  st({ id: "c", name: "Step3", role: "process", type: "machine", cycleTimeSec: 40, partsPerCycle: 1 }),
  st({ id: "out", name: "Out", role: "output", type: "store", operators: 0 }),
];
const FLOWS: Flow[] = [flow("in", "a"), flow("a", "b"), flow("b", "c"), flow("c", "out")];

describe("parts per cycle (multi-part processing)", () => {
  it("defaults to 1 and floors to a whole number", () => {
    expect(partsPerCycleOf({})).toBe(1);
    expect(partsPerCycleOf({ partsPerCycle: 4 })).toBe(4);
    expect(partsPerCycleOf({ partsPerCycle: 0 })).toBe(1);
  });

  it("multiplies part throughput by parts per cycle", () => {
    expect(stationRate(STATIONS[1], 8)).toBe(720); // 1/cycle, 40s
    expect(stationRate(STATIONS[2], 8)).toBe(2880); // 4/cycle, same 40s → 4×
  });

  it("keeps a fast multi-part step from being the bottleneck", () => {
    const bal = balanceAnalysis(STATIONS, FLOWS, 8);
    expect(bal.bottleneck?.name).toBe("Step1"); // the 1-part steps limit the line
    expect(bal.lineOut).toBe(720);
  });

  it("shows the Yamazumi bar PER PART (cycle ÷ parts per cycle)", () => {
    const cyc = cycleAnalysis(STATIONS, 40);
    const s2 = cyc.stations.find((r) => r.name === "Step2")!;
    expect(s2.partsPerCycle).toBe(4);
    expect(s2.cycleSec).toBe(40); // full machine cycle
    expect(s2.totalSec).toBe(10); // per-part = 40 / 4
    const s1 = cyc.stations.find((r) => r.name === "Step1")!;
    expect(s1.totalSec).toBe(40); // single-part unchanged
  });
});
