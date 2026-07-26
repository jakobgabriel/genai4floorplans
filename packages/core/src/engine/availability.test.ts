import { describe, it, expect } from "vitest";
import type { Station } from "../model/types";
import { availabilityOf } from "../model/types";
import { stationRate, balanceAnalysis } from "./balance";
import { SAMPLE } from "../model/sample";

const base = (over: Partial<Station> = {}): Station => ({
  id: "s", name: "s", role: "process", type: "machine", x: 0, y: 0, w: 2, h: 2, fixed: false,
  auto: "auto", autoOverride: null, capacityPerShift: 0, operators: 1, cycleTimeSec: 30,
  changeoverMin: 0, ergoRisk: "low", utilities: [], notes: "", ...over,
});

describe("equipment availability → effective capacity (audit C-02)", () => {
  it("derives availability from MTBF/MTTR, else the direct value, else 1", () => {
    expect(availabilityOf({ mtbfHours: 90, mttrHours: 10 })).toBeCloseTo(0.9, 3);
    expect(availabilityOf({ availabilityPct: 0.8 })).toBe(0.8);
    expect(availabilityOf({})).toBe(1);
    // MTBF/MTTR wins over a direct value
    expect(availabilityOf({ availabilityPct: 0.5, mtbfHours: 95, mttrHours: 5 })).toBeCloseTo(0.95, 3);
  });

  it("scales the station rate by availability", () => {
    const full = stationRate(base());
    const at90 = stationRate(base({ availabilityPct: 0.9 }));
    expect(at90).toBeCloseTo(full * 0.9, -1);
    expect(at90).toBeLessThan(full);
    // no reliability data ⇒ unchanged
    expect(stationRate(base({}))).toBe(full);
  });

  it("can turn a reliable-but-slower step into the bottleneck", () => {
    // Two serial stations: 'a' faster but only 60% available, 'b' slower but reliable.
    const a = base({ id: "a", cycleTimeSec: 20, availabilityPct: 0.6 });
    const b = base({ id: "b", cycleTimeSec: 28, role: "process" });
    const out = base({ id: "out", role: "output", type: "store", cycleTimeSec: 0 });
    const flows = [
      { from: "a", to: "b", volume: 100, unitCost: 1, transport: "manual" as const, partWeightKg: 1, notes: "" },
      { from: "b", to: "out", volume: 100, unitCost: 1, transport: "manual" as const, partWeightKg: 1, notes: "" },
    ];
    const bal = balanceAnalysis([a, b, out], flows, 8);
    // a: (3600/20)*8*0.6 = 864; b: (3600/28)*8 = 1028 → a is the constraint
    expect(bal.bottleneck?.id).toBe("a");
  });

  it("leaves the golden sample unchanged (all stations fully available)", () => {
    const bal = balanceAnalysis(SAMPLE.stations, SAMPLE.flows, SAMPLE.shiftHours);
    expect(bal.lineOut).toBe(685);
    expect(bal.bottleneck?.id).toBe("cnc");
  });
});
