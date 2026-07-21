import { describe, it, expect } from "vitest";
import { balanceAnalysis } from "./balance";
import { cycleAnalysis } from "./cycle";
import { isFlowFunction, type Station, type Flow } from "../model/types";

const base = {
  x: 0, y: 0, w: 2, h: 2, fixed: false, auto: "manual" as const, autoOverride: null,
  operators: 1, changeoverMin: 0, ergoRisk: "low" as const, utilities: [], notes: "", capacityPerShift: 0,
};
const st = (o: Partial<Station> & Pick<Station, "id" | "name" | "role" | "type">): Station => ({ ...base, cycleTimeSec: 0, ...o });

// A buffer sits IN the flow between two stations but is a flow function, not a
// work step: it holds WIP, passes material through, and must never contribute
// cycle time, a bottleneck, a Yamazumi bar or throttle the line.
const STATIONS: Station[] = [
  st({ id: "in", name: "In", role: "input", type: "store", operators: 0 }),
  st({ id: "a", name: "Cut", role: "process", type: "machine", cycleTimeSec: 30 }),
  st({ id: "buf", name: "WIP Buffer", role: "process", type: "buffer", operators: 0, cycleTimeSec: 99, bufferCapacity: 50 }),
  st({ id: "b", name: "Weld", role: "process", type: "machine", cycleTimeSec: 40 }),
  st({ id: "out", name: "Out", role: "output", type: "store", operators: 0 }),
];
const flow = (from: string, to: string): Flow => ({ from, to, volume: 1000, unitCost: 0, transport: "manual", partWeightKg: 1, notes: "" });
const FLOWS: Flow[] = [flow("in", "a"), flow("a", "buf"), flow("buf", "b"), flow("b", "out")];

describe("flow functions (buffer/store) are not work steps", () => {
  it("classifies buffer and store as flow functions, machines as work", () => {
    expect(isFlowFunction({ type: "buffer" })).toBe(true);
    expect(isFlowFunction({ type: "store" })).toBe(true);
    expect(isFlowFunction({ type: "machine" })).toBe(false);
    expect(isFlowFunction({ type: "manual" })).toBe(false);
  });

  it("keeps the buffer out of the balance and never lets it be the bottleneck", () => {
    const bal = balanceAnalysis(STATIONS, FLOWS, 8);
    expect(bal.steps.map((s) => s.name)).toEqual(["Cut", "Weld"]);
    expect(bal.bottleneck?.name).toBe("Weld");
  });

  it("does not let the buffer's cycle throttle the line", () => {
    const bal = balanceAnalysis(STATIONS, FLOWS, 8);
    // Weld at 40s sets the rate (3600/40*8 = 720), NOT the buffer's fake 99s.
    expect(bal.lineOut).toBe(720);
  });

  it("keeps the buffer out of the Yamazumi (no work cycle)", () => {
    const cyc = cycleAnalysis(STATIONS, 40);
    expect(cyc.stations.map((s) => s.name)).toEqual(["Cut", "Weld"]);
  });
});
