import { describe, it, expect } from "vitest";
import type { VariantMode, WorkElement } from "../model/types";
import { DEFAULT_LOSS_FACTOR, SCHEMA_VERSION, lossFactorOf } from "../model/types";
import { migrate } from "../model/migrate";
import { analyseWorkload, makeWorkElement, modesOf, normalizedShares, precedenceOrder } from "./workload";

const el = (id: string, sec: number, over: Partial<WorkElement> = {}): WorkElement => ({
  ...makeWorkElement(id, id.toUpperCase(), sec),
  ...over,
});

const mode = (id: string, share: number, overrides: Record<string, number> = {}): VariantMode => ({
  id,
  name: id,
  share,
  elementOverrides: overrides,
});

describe("loss factor & calculated stations (spec §4.2/§4.3)", () => {
  it("calculated stations = (work content ÷ takt) × loss factor, unrounded", () => {
    // Two 30s elements → 60s weighted. takt 40 → 1.5 raw × 1.2 loss = 1.8.
    const a = analyseWorkload([el("a", 30), el("b", 30)], undefined, 40, 1.2);
    expect(a.minStationsWeighted).toBe(2); // theoretical ceil(1.5)
    expect(a.stationsCalculated).toBeCloseTo(1.8, 5); // never silently rounded
    expect(a.lossFactor).toBe(1.2);
  });

  it("a higher loss factor raises the calculated count", () => {
    const lean = analyseWorkload([el("a", 100)], undefined, 40, 1.15);
    const loose = analyseWorkload([el("a", 100)], undefined, 40, 1.25);
    expect(loose.stationsCalculated).toBeGreaterThan(lean.stationsCalculated as number);
  });

  it("defaults to 1.2 and clamps nonsense", () => {
    expect(analyseWorkload([el("a", 40)], undefined, 40).lossFactor).toBe(DEFAULT_LOSS_FACTOR);
    expect(lossFactorOf({})).toBe(1.2);
    expect(lossFactorOf({ lossFactor: 1.18 })).toBe(1.18);
    expect(lossFactorOf({ lossFactor: -5 })).toBe(1.2);
    expect(lossFactorOf({ lossFactor: 99 })).toBe(2);
  });

  it("is null without a takt, like the other station figures", () => {
    expect(analyseWorkload([el("a", 40)], undefined).stationsCalculated).toBeNull();
  });
});

describe("mix modes", () => {
  it("falls back to a single implicit mode when none are declared", () => {
    expect(modesOf(undefined)).toHaveLength(1);
    expect(modesOf([])[0].id).toBe("__single");
  });

  it("renormalises shares that do not sum to 1", () => {
    expect(normalizedShares([mode("a", 3), mode("b", 1)])).toEqual([0.75, 0.25]);
  });

  it("splits evenly when every share is zero rather than dividing by zero", () => {
    expect(normalizedShares([mode("a", 0), mode("b", 0)])).toEqual([0.5, 0.5]);
  });
});

describe("analyseWorkload — the 40-product case", () => {
  // Three modes, not forty parts. Only work content differs.
  const elements = [el("load", 20), el("weld", 40), el("test", 30)];
  const modes = [
    mode("base", 0.6),
    mode("heavy", 0.25, { weld: 2 }), // double weld content
    mode("light", 0.15, { test: 0 }), // test skipped entirely
  ];

  it("weights element time by the mix", () => {
    const a = analyseWorkload(elements, modes);
    // weld: 40×0.6 + 80×0.25 + 40×0.15 = 24 + 20 + 6 = 50
    expect(a.elements.find((e) => e.elementId === "weld")?.weightedSec).toBe(50);
    // test: 30×0.6 + 30×0.25 + 0×0.15 = 25.5
    expect(a.elements.find((e) => e.elementId === "test")?.weightedSec).toBe(25.5);
  });

  it("reports the worst mode per element, not just the average", () => {
    const weld = analyseWorkload(elements, modes).elements.find((e) => e.elementId === "weld");
    expect(weld?.maxSec).toBe(80);
    expect(weld?.worstModeId).toBe("heavy");
  });

  it("records the modes in which an element is skipped", () => {
    const test = analyseWorkload(elements, modes).elements.find((e) => e.elementId === "test");
    expect(test?.skippedInModeIds).toEqual(["light"]);
  });

  it("totals each mode separately and identifies the heaviest", () => {
    const a = analyseWorkload(elements, modes);
    expect(a.modes.find((m) => m.modeId === "base")?.totalSec).toBe(90);
    expect(a.modes.find((m) => m.modeId === "heavy")?.totalSec).toBe(130);
    expect(a.modes.find((m) => m.modeId === "light")?.totalSec).toBe(60);
    expect(a.worstModeId).toBe("heavy");
    expect(a.worstTotalSec).toBe(130);
  });

  it("quantifies the spread between the average and the worst mode", () => {
    const a = analyseWorkload(elements, modes);
    // weighted total = 20 + 50 + 25.5 = 95.5; worst = 130 => +36%
    expect(a.weightedTotalSec).toBe(95.5);
    expect(a.mixSpreadPct).toBeCloseTo(36.1, 0);
  });

  it("gives separate station counts for the average and the worst mode", () => {
    const a = analyseWorkload(elements, modes, 30);
    expect(a.minStationsWeighted).toBe(4); // ceil(95.5/30)
    expect(a.minStationsWorst).toBe(5); // ceil(130/30) — the number that matters
  });

  it("warns that balancing to the average will starve the heavy variant", () => {
    const a = analyseWorkload(elements, modes, 30);
    expect(a.issues.join(" ")).toMatch(/more work than the mix average/);
  });

  it("flags an element that cannot fit one station in its worst mode", () => {
    const a = analyseWorkload(elements, modes, 50);
    expect(a.overTaktElements.map((e) => e.elementId)).toEqual(["weld"]); // 80s > 50s takt
    expect(a.issues.join(" ")).toMatch(/cannot fit one station/);
  });

  it("stays silent about spread when the mix is uniform", () => {
    // Takt 50 clears the longest element (40s), so the only thing that could
    // raise an issue is mix spread — and with one mode there is none.
    const a = analyseWorkload(elements, [mode("only", 1)], 50);
    expect(a.mixSpreadPct).toBe(0);
    expect(a.issues).toEqual([]);
  });
});

describe("work classification and manning", () => {
  const elements = [
    el("cut", 30, { classification: "VA" }),
    el("move", 20, { classification: "NVA", wasteClass: "transport" }),
    el("inspect", 10, { classification: "NNVA" }),
  ];

  it("splits weighted content by VA / NNVA / NVA", () => {
    const a = analyseWorkload(elements, undefined);
    expect(a.vaSec).toBe(30);
    expect(a.nnvaSec).toBe(10);
    expect(a.nvaSec).toBe(20);
    expect(a.vaPct).toBe(50);
  });

  it("uses attendedFraction to separate operator-bound from machine time", () => {
    const semi = [
      el("load", 10, { attendedFraction: 1 }),
      el("machine", 90, { attendedFraction: 0 }), // unattended cycle
    ];
    const a = analyseWorkload(semi, undefined);
    expect(a.weightedTotalSec).toBe(100);
    expect(a.attendedTotalSec).toBe(10); // one operator is only tied up for 10s
    expect(a.attendedPct).toBe(10);
  });

  it("clamps an out-of-range attendedFraction instead of trusting it", () => {
    const a = analyseWorkload([el("x", 10, { attendedFraction: 5 })], undefined);
    expect(a.attendedTotalSec).toBe(10);
  });

  it("propagates the weakest input confidence to the result", () => {
    const mixed = [
      el("a", 10, { time: { seconds: 10, method: "measured", confidence: "high" } }),
      el("b", 10, { time: { seconds: 10, method: "estimate", confidence: "low" } }),
    ];
    expect(analyseWorkload(mixed, undefined).confidence).toBe("low");
  });
});

describe("validation", () => {
  it("reports overrides pointing at unknown elements", () => {
    const a = analyseWorkload([el("a", 10)], [mode("m", 1, { ghost: 2 })]);
    expect(a.issues.join(" ")).toMatch(/unknown element "ghost"/);
  });

  it("reports unknown predecessors", () => {
    const a = analyseWorkload([el("a", 10, { predecessors: ["nope"] })], undefined);
    expect(a.issues.join(" ")).toMatch(/unknown predecessor/);
  });

  it("notes when declared shares were renormalised", () => {
    const a = analyseWorkload([el("a", 10)], [mode("x", 0.3), mode("y", 0.3)]);
    expect(a.issues.join(" ")).toMatch(/sum to 60%/);
  });
});

describe("precedence DAG", () => {
  it("orders a diamond correctly", () => {
    const order = precedenceOrder([
      el("a", 1),
      el("b", 1, { predecessors: ["a"] }),
      el("c", 1, { predecessors: ["a"] }),
      el("d", 1, { predecessors: ["b", "c"] }),
    ]) as string[];
    expect(order[0]).toBe("a");
    expect(order[3]).toBe("d");
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("d"));
  });

  it("returns null on a cycle rather than looping", () => {
    expect(precedenceOrder([el("a", 1, { predecessors: ["b"] }), el("b", 1, { predecessors: ["a"] })])).toBeNull();
  });

  it("ignores predecessors outside the element set", () => {
    expect(precedenceOrder([el("a", 1, { predecessors: ["ghost"] })])).toEqual(["a"]);
  });
});

describe("migration to v8", () => {
  it("leaves legacy models without a workload", () => {
    const m = migrate({ schemaVersion: 7, name: "L", gridW: 10, gridH: 10, noGoZones: [], flows: [], stations: [] });
    expect(m.schemaVersion).toBe(SCHEMA_VERSION);
    expect(m.workElements).toBeUndefined();
    expect(m.variantModes).toBeUndefined();
  });

  it("round-trips a workload with variant modes", () => {
    const m = migrate({
      schemaVersion: SCHEMA_VERSION,
      name: "W",
      gridW: 10,
      gridH: 10,
      noGoZones: [],
      flows: [],
      stations: [],
      workElements: [makeWorkElement("a", "A", 12)],
      variantModes: [{ id: "m1", name: "Base", share: 1, elementOverrides: {} }],
    });
    expect(m.workElements?.[0].time.seconds).toBe(12);
    expect(m.variantModes?.[0].name).toBe("Base");
  });
});
