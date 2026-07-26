import { describe, it, expect } from "vitest";
import { derivePortfolio, type Part } from "./portfolio";

const part = (partNumber: string, steps: [string, number][], demandByYear: number[]): Part => ({
  id: partNumber,
  partNumber,
  steps: steps.map(([name, cycleTimeSec]) => ({ name, cycleTimeSec })),
  demandByYear,
});

describe("derivePortfolio", () => {
  it("returns null when nothing usable was given", () => {
    expect(derivePortfolio([])).toBeNull();
    expect(derivePortfolio([part("A", [], [100])])).toBeNull();
    expect(derivePortfolio([part("A", [["Press", 10]], [0, 0])])).toBeNull();
  });

  it("sizes against the peak year, not the first or the average", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [1000, 5000, 3000]),
      part("B", [["Press", 10]], [500, 1000, 500]),
    ])!;
    expect(d.years).toBe(3);
    expect(d.totalByYear).toEqual([1500, 6000, 3500]);
    // Ramp peaks in year 2, so that is the year the cell must survive.
    expect(d.peakYear).toBe(2);
    expect(d.peakVolume).toBe(6000);
  });

  it("counts every part and every year into the program volume", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [1000, 5000, 3000]),
      part("B", [["Press", 10]], [500, 1000, 500]),
    ])!;
    expect(d.programVolume).toBe(11000);
  });

  it("treats a short demand curve as zero in the remaining years", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [100, 100, 100]),
      part("B", [["Press", 10]], [900]), // one year only
    ])!;
    expect(d.totalByYear).toEqual([1000, 100, 100]);
    expect(d.peakYear).toBe(1);
  });

  it("builds a union routing so the cell has a station for every step", () => {
    const d = derivePortfolio([
      part("A", [["Load", 5], ["Press", 10]], [100]),
      part("B", [["Load", 5], ["Weld", 20], ["Pack", 8]], [100]),
    ])!;
    expect(d.steps.map((s) => s.name)).toEqual(["Load", "Press", "Weld", "Pack"]);
  });

  it("collapses parts with identical work content into one mode", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [100]),
      part("B", [["Press", 10]], [300]),
      part("C", [["Press", 10]], [600]),
    ])!;
    expect(d.modes).toHaveLength(1);
    expect(d.modes[0].name).toBe("A, B, C");
    expect(d.modes[0].share).toBe(1);
  });

  it("skips the union steps a mode's parts do not use", () => {
    const d = derivePortfolio([
      part("A", [["Load", 5], ["Press", 10]], [600]),
      part("B", [["Load", 5], ["Weld", 20]], [400]),
    ])!;
    expect(d.modes).toHaveLength(2);
    // Union order is Load(we1), Press(we2), Weld(we3).
    const a = d.modes.find((m) => m.name === "A")!;
    const b = d.modes.find((m) => m.name === "B")!;
    expect(a.elementOverrides).toEqual({ we3: 0 }); // A does not weld
    expect(b.elementOverrides).toEqual({ we2: 0 }); // B does not press
    expect(a.share).toBe(0.6);
    expect(b.share).toBe(0.4);
  });

  it("expresses a longer cycle for the same step as a ratio, not a new step", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [500]),
      part("B", [["Press", 25]], [500]),
    ])!;
    expect(d.steps).toHaveLength(1);
    const b = d.modes.find((m) => m.name === "B")!;
    expect(b.elementOverrides.we1).toBe(2.5);
  });

  it("shares are of the peak year, so a late ramp is weighted by its own year", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [1000, 200]),
      part("B", [["Weld", 10]], [0, 800]),
    ])!;
    expect(d.peakYear).toBe(1); // 1000 vs 1000 — first wins on a tie
    const shares = Object.fromEntries(d.modes.map((m) => [m.name, m.share]));
    expect(shares.A).toBe(1);
    expect(shares.B).toBe(0);
  });

  it("reports the parts it ignored rather than dropping them silently", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [100]),
      part("B", [], [500]),
      part("C", [["Weld", 5]], [0]),
    ])!;
    expect(d.ignored).toEqual(["B", "C"]);
    expect(d.modes).toHaveLength(1);
  });

  it("maps each part number to the mode it landed in", () => {
    const d = derivePortfolio([
      part("A", [["Press", 10]], [100]),
      part("B", [["Press", 10]], [100]),
      part("C", [["Weld", 10]], [100]),
    ])!;
    expect(d.modeOfPart.A).toBe(d.modeOfPart.B);
    expect(d.modeOfPart.C).not.toBe(d.modeOfPart.A);
  });
});
