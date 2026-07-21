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
    // labor saved/yr = 1 op × 8h × $45 × 460 shifts = 165,600. Payback nets the
    // new equipment's upkeep (5% of $100k = $5,000/yr, audit C-08): 100,000 ÷
    // 160,600 × 12 ≈ 7.5 months — slightly longer than the naive 7.2.
    expect(cnc.laborSavedPerYear).toBe(165600);
    expect(cnc.paybackMonths).toBeCloseTo(7.5, 1);
  });

  it("charges floor space and maintenance into opex (audit C-08)", () => {
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, capex: 200000 } : s));
    const c = costAnalysis({ ...SAMPLE, stations });
    // Space: 48 m² × 1.35 × $150/m²·yr ÷ 460 shifts ≈ $21.1/shift.
    expect(c.spacePerShift).toBeGreaterThan(0);
    // Maintenance: $200k × 5%/yr ÷ 460 ≈ $21.7/shift.
    expect(c.maintenancePerShift).toBeCloseTo((200000 * 0.05) / 460, 1);
    // Both are folded into opex and thus cost per part.
    expect(c.opexPerShift).toBeCloseTo(c.laborPerShift + c.energyPerShift + c.transportPerShift + c.spacePerShift + c.maintenancePerShift, 2);
  });

  it("respects costConfig overrides", () => {
    const base = costAnalysis(SAMPLE).laborPerShift;
    const doubled = costAnalysis({ ...SAMPLE, costConfig: { laborCostPerHour: 90 } }).laborPerShift;
    expect(doubled).toBeCloseTo(base * 2, 2);
  });

  it("reports floor space split cell vs material supply (blueprint §4.9)", () => {
    const c = costAnalysis(SAMPLE);
    // SAMPLE footprints: 3×2 + 3×3 + 4×3 + 3×3 + 3×2 + 3×2 = 6+9+12+9+6+6 = 48 cells.
    expect(c.floorSpace.cell).toBe(48);
    // Default scale is 1 cell = 1 m², so floor space reports in m².
    expect(c.floorSpace.unit).toBe("m²");
    // Default +35% material supply, reported separately, never folded in.
    expect(c.floorSpace.materialSupply).toBeCloseTo(48 * 0.35, 2);
    expect(c.floorSpace.total).toBeCloseTo(48 * 1.35, 2);
  });

  it("reports floor space in m² when a cell area is given", () => {
    const c = costAnalysis({ ...SAMPLE, costConfig: { cellAreaM2: 0.25, materialSupplyFactor: 0.4 } });
    expect(c.floorSpace.unit).toBe("m²");
    expect(c.floorSpace.cell).toBeCloseTo(48 * 0.25, 2);
    expect(c.floorSpace.materialSupply).toBeCloseTo(48 * 0.25 * 0.4, 2);
  });

  it("counts reserved space (spacer/aisle/esd) but not blocking obstacles", () => {
    // A 2×2 spacer is reserved floor; a 2×2 blocking area is not (it's an obstacle).
    const withZones = {
      ...SAMPLE,
      noGoZones: [
        { x: 0, y: 12, w: 2, h: 2, kind: "spacer" as const },
        { x: 18, y: 12, w: 2, h: 2, kind: "blocking" as const },
      ],
    };
    const c = costAnalysis(withZones);
    expect(c.floorSpace.reserved).toBe(4); // only the spacer
    expect(c.floorSpace.total).toBeCloseTo(48 * 1.35 + 4, 2);
    // A plain SAMPLE reserves nothing.
    expect(costAnalysis(SAMPLE).floorSpace.reserved).toBe(0);
  });
});
