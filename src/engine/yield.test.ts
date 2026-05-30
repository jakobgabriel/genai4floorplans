import { describe, it, expect } from "vitest";
import { SAMPLE } from "../model/sample";
import { yieldAnalysis } from "./yield";

describe("yieldAnalysis", () => {
  it("is 100% with no scrap (SAMPLE) and adds no scrap units", () => {
    const y = yieldAnalysis(SAMPLE.stations, SAMPLE.flows);
    expect(y.rolledYield).toBe(100);
    expect(y.totalScrap).toBe(0);
  });

  it("computes rolled yield as the product of (1 - scrapRate)", () => {
    const stations = SAMPLE.stations.map((s) =>
      s.id === "cnc" ? { ...s, scrapRate: 0.1 } : s.id === "assembly" ? { ...s, scrapRate: 0.2 } : s,
    );
    const y = yieldAnalysis(stations, SAMPLE.flows);
    // 0.9 * 0.8 = 0.72
    expect(y.rolledYield).toBeCloseTo(72, 1);
    expect(y.totalScrap).toBeGreaterThan(0);
  });

  it("scrap units = inflow × scrapRate", () => {
    const stations = SAMPLE.stations.map((s) => (s.id === "cnc" ? { ...s, scrapRate: 0.5 } : s));
    const y = yieldAnalysis(stations, SAMPLE.flows);
    const cnc = y.steps.find((s) => s.id === "cnc")!;
    // raw→cnc volume is 1200, so 50% scrap = 600
    expect(cnc.inflow).toBe(1200);
    expect(cnc.scrapUnits).toBe(600);
  });
});
