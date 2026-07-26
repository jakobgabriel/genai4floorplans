import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { costAnalysis } from "./cost";

describe("costAnalysis", () => {
  it("computes labor, opex and cost per part for the SAMPLE cell", () => {
    const c = costAnalysis(SAMPLE);
    // operators: 0+1+1+3+1+1 = 7 → 7 × 8h × $45 = 2520/shift
    expect(c.laborPerShift).toBe(2520);
    expect(c.capexTotal).toBe(0);
    expect(c.lineOut).toBe(685);
    expect(c.costPerPart).toBeGreaterThan(0);
    // costPerPart = (labor + transport) / lineOut
    expect(c.costPerPart).toBeCloseTo((c.opexPerShift) / c.lineOut, 2);
  });

  it("derives automation payback from automation capex and labor saved", () => {
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, automationCapex: 100000 } : s));
    const c = costAnalysis({ ...SAMPLE, stations });
    const cnc = c.automation.find((a) => a.id === "cnc")!;
    // labor saved/yr = 1 op × 8h × $45 × 460 shifts = 165,600 → payback ≈ 7.2 months
    expect(cnc.laborSavedPerYear).toBe(165600);
    expect(cnc.paybackMonths).toBeCloseTo(7.2, 1);
  });

  it("respects costConfig overrides", () => {
    const base = costAnalysis(SAMPLE).laborPerShift;
    const doubled = costAnalysis({ ...SAMPLE, costConfig: { laborCostPerHour: 90 } }).laborPerShift;
    expect(doubled).toBeCloseTo(base * 2, 2);
  });
});
