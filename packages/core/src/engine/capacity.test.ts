import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { capacityAnalysis } from "./capacity";
import { costAnalysis } from "./cost";

describe("capacity analysis (PAUL Capa MA/HC)", () => {
  it("reports no demand when none is set", () => {
    const c = capacityAnalysis(SAMPLE);
    expect(c.hasDemand).toBe(false);
    expect(c.years).toEqual([]);
  });

  it("derives machines-needed per year from demand, cycle and the shift model", () => {
    const model = {
      ...SAMPLE,
      demand: {
        years: [{ year: 2026, units: 500_000 }, { year: 2027, units: 1_000_000 }],
        shiftsPerDay: 1,
        hoursPerShift: 8,
        workingDaysPerYear: 220,
        oee: 1,
      },
    };
    const c = capacityAnalysis(model);
    expect(c.hasDemand).toBe(true);
    expect(c.peakYear).toBe(2027);
    // available sec/yr = 220 × 1 × 8 × 3600 × 1 = 6,336,000.
    expect(c.availableSecPerYear).toBe(6_336_000);
    // CNC (machine): 42 s cycle. 2027: 1,000,000 × 42 = 42,000,000 s → ceil / 6.336M = 7 machines.
    const cnc = c.machines.find((m) => m.stationId === "cnc")!;
    expect(cnc.perYear.find((p) => p.year === 2027)!.machinesNeeded).toBe(7);
    // A doubling of demand never needs fewer machines.
    const y26 = cnc.perYear.find((p) => p.year === 2026)!.machinesNeeded;
    expect(cnc.perYear.find((p) => p.year === 2027)!.machinesNeeded).toBeGreaterThanOrEqual(y26);
    // Manual assembly is not a machine step.
    expect(c.machines.some((m) => m.stationId === "assembly")).toBe(false);
  });
});

describe("LDC / MDC cost split (PAUL)", () => {
  it("splits cost per part into labour- and machine-dependent parts", () => {
    const c = costAnalysis(SAMPLE);
    expect(c.ldcPerPart).toBeGreaterThan(0);
    // ldc + mdc reconstructs the operating cost per part (labour + energy + transport).
    expect(c.ldcPerPart + c.mdcPerPart).toBeCloseTo(c.costPerPart, 2);
  });
});
